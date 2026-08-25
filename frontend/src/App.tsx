import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    getInfo,
    getHistory,
    sendPostcard,
    buildPostcard,
    submitPostcard,
    resolveAddress,
    getAddressBalance,
    explorerUrl,
    ApiError,
} from "./lib/api";
import type { Info, HistoryEntry } from "./lib/api";
import { setService } from "./lib/api";
import { DEFAULT_SERVICE, serviceByKey } from "./lib/services";
import type { ServiceKey } from "./lib/services";
import { ServiceSwitch } from "./components/ServiceSwitch";
import { connect, isEnabled, watchWallets, walletErrorMessage } from "./lib/cip30";
import type { FullApi, WalletHandle } from "./lib/cip30";
import {
    formatAda,
    formatDateTime,
    lovelaceToAda,
    shortHash,
    confirmationState,
} from "./lib/format";
import { StatCard } from "./components/StatCard";
import { AreaChart } from "./components/AreaChart";
import type { Point } from "./components/AreaChart";
import { BarChart } from "./components/BarChart";
import { ComposeForm } from "./components/ComposeForm";
import { WalletBar } from "./components/WalletBar";
import type { Connection, SendMode } from "./components/WalletBar";
import { HistoryList } from "./components/HistoryList";
import { ArrowDownIcon, ExternalLinkIcon, WalletIcon } from "./components/Icons";
import "./App.css";

const REFRESH_MS = 20_000;
/** While a transaction blocks the next send, poll harder so the form unlocks quickly. */
const REFRESH_MS_WAITING = 5_000;

function App() {
    const [info, setInfo] = useState<Info | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [lastTxHash, setLastTxHash] = useState("");
    const [error, setError] = useState("");

    // Which language service answers. Persisted so a reload keeps the choice.
    const [service, setServiceKey] = useState<ServiceKey>(() => {
        const stored = localStorage.getItem("adasenda.service") as ServiceKey | null;
        return stored ? serviceByKey(stored).key : DEFAULT_SERVICE;
    });

    const activeService = serviceByKey(service);

    const [mode, setMode] = useState<SendMode>("server");
    const [wallets, setWallets] = useState<WalletHandle[]>([]);
    const [connection, setConnection] = useState<Connection | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    // The CIP-30 handle itself never renders, so it stays out of state.
    const walletApi = useRef<FullApi | null>(null);

    /**
     * A transaction locks its inputs until a block picks it up, so sending again
     * beforehand would try to spend UTXOs that are already gone.
     */
    const hasUnconfirmed = history.some((h) => h.confirmations === 0);

    /** Browser-wallet mode cannot send until a wallet is actually connected. */
    const needsWallet = mode === "wallet" && connection === null;

    const payer = mode === "wallet" ? connection?.address : info?.sender;
    const payerBalance = mode === "wallet" ? connection?.balance : info?.balance;

    const refresh = useCallback(async () => {
        // Point the client at the chosen service before every round of requests.
        setService(service);

        try {
            const [nextInfo, nextHistory] = await Promise.all([getInfo(), getHistory()]);
            setInfo(nextInfo);
            setHistory(nextHistory);
            setError("");
        } catch (err) {
            setError(err instanceof ApiError ? err.message : String(err));
        }
    }, [service]);

    function handleServiceChange(key: ServiceKey) {
        if (key === service) return;

        setServiceKey(key);
        localStorage.setItem("adasenda.service", key);

        // The next service has its own balance and its own view of the history.
        setInfo(null);
        setHistory([]);
        setLastTxHash("");
        setError("");
    }

    // Not every service implements the CIP-30 endpoints yet.
    useEffect(() => {
        if (!activeService.wallet && mode === "wallet") setMode("server");
    }, [activeService, mode]);


    useEffect(() => {
        refresh();
    }, [refresh]);

    // Confirmations and balance keep moving after a send, so poll instead of
    // only reading them once on mount.
    useEffect(() => {
        const timer = setInterval(refresh, hasUnconfirmed ? REFRESH_MS_WAITING : REFRESH_MS);
        return () => clearInterval(timer);
    }, [refresh, hasUnconfirmed]);

    // Extensions inject themselves after the first render, so watch instead of looking once.
    useEffect(() => watchWallets(setWallets), []);

    const openWallet = useCallback(async (key: string) => {
        const api = await connect(key);

        // getNetworkId only tells testnet from mainnet; which testnet it is only
        // becomes clear once the backend decodes the address.
        if ((await api.getNetworkId()) !== 0) {
            throw new Error("That wallet is on mainnet. Switch it to preprod.");
        }

        const { address, balance } = await resolveAddress(await api.getChangeAddress());
        walletApi.current = api;

        return { key, address, balance };
    }, []);

    async function handleConnect(key: string) {
        setIsConnecting(true);
        setError("");

        try {
            const opened = await openWallet(key);
            const name = wallets.find((w) => w.key === key)?.name ?? key;
            setConnection({ ...opened, name });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : walletErrorMessage(err));
        } finally {
            setIsConnecting(false);
        }
    }

    function handleDisconnect() {
        // CIP-30 has no revoke; dropping the handle is all a page can do.
        walletApi.current = null;
        setConnection(null);
    }

    // A wallet that already trusts this page can be picked up again without a popup.
    useEffect(() => {
        if (connection || wallets.length === 0) return;

        let cancelled = false;

        (async () => {
            for (const wallet of wallets) {
                if (cancelled) return;
                if (!(await isEnabled(wallet.key))) continue;

                try {
                    const opened = await openWallet(wallet.key);
                    if (!cancelled) setConnection({ ...opened, name: wallet.name });
                } catch {
                    // Silently: nobody asked for this connection.
                }
                return;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [wallets, connection, openWallet]);

    // The connected wallet's balance moves for the same reasons the server one does.
    useEffect(() => {
        if (!connection) return;

        const update = async () => {
            try {
                const { balance } = await getAddressBalance(connection.address);
                setConnection((current) =>
                    current && current.address === connection.address ? { ...current, balance } : current,
                );
            } catch {
                // Keep the last known balance rather than blanking the card.
            }
        };

        const timer = setInterval(update, hasUnconfirmed ? REFRESH_MS_WAITING : REFRESH_MS);
        return () => clearInterval(timer);
    }, [connection, hasUnconfirmed]);

    async function sendFromWallet(message: string, ada: number) {
        const api = walletApi.current;
        if (!api || !connection) throw new Error("Connect a wallet first.");

        const { txCbor } = await buildPostcard(message, ada, connection.address);
        // partialSign stays false: the wallet supplies every signature this needs.
        const witnessSet = await api.signTx(txCbor, false);

        return await submitPostcard(txCbor, witnessSet);
    }

    async function handleSend(message: string, ada: number) {
        setIsSending(true);
        setLastTxHash("");
        setError("");

        try {
            const { txHash } =
                mode === "wallet" ? await sendFromWallet(message, ada) : await sendPostcard(message, ada);
            setLastTxHash(txHash);
            refresh();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : walletErrorMessage(err));
        } finally {
            setIsSending(false);
        }
    }

    const stats = useMemo(() => {
        const totalLovelace = history.reduce((sum, h) => sum + Number(h.lovelace), 0);
        const pending = history.filter((h) => confirmationState(h.confirmations) !== "settled");
        const bytes = history.reduce((sum, h) => sum + new TextEncoder().encode(h.message).length, 0);

        return { totalLovelace, pending: pending.length, bytes };
    }, [history]);

    /**
     * The backend stores only the amounts, so the balance line is reconstructed:
     * start from today's balance and add each transaction back as we walk into
     * the past. Fees are not recorded, so the line tracks sends, not the exact
     * on-chain balance.
     */
    const balanceSeries = useMemo<Point[]>(() => {
        if (!info?.balance || history.length === 0) return [];

        const oldestFirst = [...history].reverse();
        const points: Point[] = [];
        let balance = lovelaceToAda(info.balance);

        for (let i = oldestFirst.length - 1; i >= 0; i--) {
            points.unshift({ label: formatDateTime(oldestFirst[i]!.sentAt), value: balance });
            balance += lovelaceToAda(oldestFirst[i]!.lovelace);
        }

        points.unshift({ label: "before first send", value: balance });
        return points;
    }, [info?.balance, history]);

    const amountSeries = useMemo<Point[]>(
        () =>
            [...history]
                .reverse()
                .map((h) => ({ label: formatDateTime(h.sentAt), value: lovelaceToAda(h.lovelace) })),
        [history],
    );

    return (
        <div className="shell">
            <header className="masthead">
                <div>
                    <p className="eyebrow">
                        <span className="live-dot" aria-hidden />
                        Cardano {info?.network ?? "preprod"} testnet
                    </p>
                    <h1>ADA Postcard</h1>
                    <p className="lede">
                        Every message you send is written into a transaction and stays on the chain
                        forever.
                    </p>
                </div>

                <ServiceSwitch
                    active={service}
                    onChange={handleServiceChange}
                    disabled={isSending}
                />
            </header>

            {error && (
                <div className="banner banner-error" role="alert">
                    {error}
                </div>
            )}

            {lastTxHash && (
                <div className="banner banner-success" role="status">
                    <span>Postcard submitted.</span>
                    <a href={explorerUrl(lastTxHash)} target="_blank" rel="noreferrer">
                        {shortHash(lastTxHash)}
                        <ExternalLinkIcon />
                    </a>
                </div>
            )}

            <section className="stats" aria-label="Wallet overview">
                <StatCard
                    label="Wallet balance"
                    value={payerBalance ? formatAda(payerBalance) : "—"}
                    unit=" ADA"
                    hint={mode === "wallet" ? "connected browser wallet" : "generated sender wallet"}
                    accent
                />
                <StatCard
                    label="Total sent"
                    value={formatAda(stats.totalLovelace)}
                    unit=" ADA"
                    hint={`across ${history.length} transaction${history.length === 1 ? "" : "s"}`}
                />
                <StatCard
                    label="In flight"
                    value={stats.pending}
                    hint={stats.pending === 0 ? "all settled" : "waiting on confirmations"}
                />
                <StatCard
                    label="Written on-chain"
                    value={stats.bytes}
                    unit=" bytes"
                    hint="of message metadata"
                />
            </section>

            <div className="grid">
                <div className="column">
                    <WalletBar
                        mode={mode}
                        onModeChange={setMode}
                        wallets={wallets}
                        connection={connection}
                        isConnecting={isConnecting}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        walletSupported={activeService.wallet}
                        serviceLabel={activeService.label}
                    />

                    <ComposeForm
                        maxBytes={info?.maxMessageBytes ?? 64}
                        isSending={isSending}
                        isBlocked={hasUnconfirmed || needsWallet}
                        blockedLabel={needsWallet ? "Connect a wallet first" : undefined}
                        blockedHint={
                            needsWallet
                                ? "Browser wallet mode is selected, so the transaction has to be signed by your wallet."
                                : undefined
                        }
                        onSend={handleSend}
                    />

                    {info && (
                        <section className="panel route">
                            <div className="panel-head">
                                <h2>Route</h2>
                            </div>
                            <div className="route-node">
                                <WalletIcon />
                                <div>
                                    <span className="field-label">From</span>
                                    <code>{payer ?? "no wallet connected"}</code>
                                </div>
                            </div>
                            <div className="route-arrow" aria-hidden>
                                <ArrowDownIcon />
                            </div>
                            <div className="route-node">
                                <WalletIcon />
                                <div>
                                    <span className="field-label">To</span>
                                    <code>{info.receiver}</code>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                <div className="column">
                    <section className="panel">
                        <div className="panel-head">
                            <h2>Balance over time</h2>
                            <span className="panel-note">reconstructed from sends</span>
                        </div>
                        <AreaChart
                            points={balanceSeries}
                            unit=" ADA"
                            caption="Sender wallet balance after each postcard, oldest to newest"
                        />
                    </section>

                    <section className="panel">
                        <div className="panel-head">
                            <h2>Amount per postcard</h2>
                            <span className="panel-note">{history.length} sends</span>
                        </div>
                        <BarChart
                            points={amountSeries}
                            unit=" ADA"
                            caption="ADA attached to each postcard, oldest to newest"
                        />
                    </section>
                </div>
            </div>

            <section className="panel">
                <div className="panel-head">
                    <h2>Postcard history</h2>
                    <span className="panel-note">auto-refreshes every 20s</span>
                </div>
                <HistoryList entries={history} />
            </section>
        </div>
    );
}

export default App;
