import type { WalletHandle } from "../lib/cip30";
import { formatAda } from "../lib/format";
import { SpinnerIcon, WalletIcon } from "./Icons";

export type SendMode = "server" | "wallet";

export interface Connection {
    key: string;
    name: string;
    address: string;
    balance: string | null;
}

interface Props {
    mode: SendMode;
    onModeChange: (mode: SendMode) => void;
    wallets: WalletHandle[];
    connection: Connection | null;
    isConnecting: boolean;
    onConnect: (key: string) => void;
    onDisconnect: () => void;
}

export function WalletBar({
    mode,
    onModeChange,
    wallets,
    connection,
    isConnecting,
    onConnect,
    onDisconnect,
}: Props) {
    return (
        <section className="panel wallet-bar" aria-label="Sending wallet">
            <div className="panel-head">
                <h2>Who pays</h2>
                <div className="mode-switch" role="group" aria-label="Send mode">
                    <button
                        type="button"
                        className={`chip${mode === "server" ? " is-active" : ""}`}
                        onClick={() => onModeChange("server")}
                    >
                        Generated wallet
                    </button>
                    <button
                        type="button"
                        className={`chip${mode === "wallet" ? " is-active" : ""}`}
                        onClick={() => onModeChange("wallet")}
                    >
                        Browser wallet
                    </button>
                </div>
            </div>

            {mode === "server" ? (
                <p className="field-help">
                    The service holds the keys and signs on its own. Nothing to connect, and nothing
                    you could do with it outside this demo.
                </p>
            ) : connection ? (
                <div className="wallet-connected">
                    <div className="route-node">
                        <WalletIcon />
                        <div>
                            <span className="field-label">{connection.name}</span>
                            <code>{connection.address}</code>
                        </div>
                    </div>
                    <div className="wallet-connected-foot">
                        <span className="panel-note">
                            {connection.balance !== null
                                ? `${formatAda(connection.balance)} ADA available`
                                : "balance unavailable"}
                        </span>
                        <button type="button" className="chip" onClick={onDisconnect}>
                            Disconnect
                        </button>
                    </div>
                </div>
            ) : wallets.length === 0 ? (
                <p className="field-help">
                    No CIP-30 wallet found. Install one, set it to preprod, then reload this page.
                </p>
            ) : (
                <div className="wallet-choices">
                    {wallets.map((wallet) => (
                        <button
                            key={wallet.key}
                            type="button"
                            className="wallet-choice"
                            onClick={() => onConnect(wallet.key)}
                            disabled={isConnecting}
                        >
                            {isConnecting ? (
                                <SpinnerIcon />
                            ) : (
                                <img src={wallet.icon} alt="" width={20} height={20} />
                            )}
                            {wallet.name}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
