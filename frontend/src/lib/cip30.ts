/**
 * The CIP-30 dApp connector: how a browser wallet exposes itself to a page.
 *
 * Everything a wallet returns that CIP-30 calls `cbor<…>` arrives as a hex string,
 * addresses included. Turning those into something usable happens in the backend,
 * which has the Cardano library.
 */

/** What sits under `window.cardano.<key>` before the user has approved anything. */
interface InitialApi {
    name: string;
    icon: string;
    apiVersion: string;
    enable(): Promise<FullApi>;
    isEnabled(): Promise<boolean>;
}

/** What `enable()` resolves to. Only the methods this app actually calls. */
export interface FullApi {
    getNetworkId(): Promise<number>;
    getChangeAddress(): Promise<string>;
    getUsedAddresses(): Promise<string[]>;
    /** Returns the witness set, not the finished transaction. */
    signTx(tx: string, partialSign?: boolean): Promise<string>;
}

export interface WalletHandle {
    key: string;
    name: string;
    icon: string;
}

declare global {
    interface Window {
        cardano?: Record<string, unknown>;
    }
}

function isInitialApi(value: unknown): value is InitialApi {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<InitialApi>;
    return typeof candidate.enable === "function" && typeof candidate.name === "string";
}

/**
 * Wallets that are installed right now. `window.cardano` also holds keys that are
 * not wallets, so anything without `enable()` is ignored.
 */
export function listWallets(): WalletHandle[] {
    const injected = window.cardano;
    if (!injected) return [];

    return Object.entries(injected)
        .filter(([, value]) => isInitialApi(value))
        .map(([key, value]) => {
            const wallet = value as InitialApi;
            return { key, name: wallet.name, icon: wallet.icon };
        });
}

/**
 * Extensions inject themselves after the page has already rendered, so looking
 * once on mount reports "no wallet" to people who have one. Poll briefly instead.
 */
export function watchWallets(onChange: (wallets: WalletHandle[]) => void): () => void {
    let previous = "";

    const check = () => {
        const wallets = listWallets();
        const signature = wallets.map((w) => w.key).join(",");
        if (signature !== previous) {
            previous = signature;
            onChange(wallets);
        }
    };

    check();
    const timer = setInterval(check, 400);
    // Two seconds is long past the point where a present extension has appeared.
    const stop = setTimeout(() => clearInterval(timer), 2_000);

    return () => {
        clearInterval(timer);
        clearTimeout(stop);
    };
}

/**
 * How long to wait for `enable()` before giving up. Not a nicety: a wallet whose
 * internal bridge is not ready logs its own timeout and simply never settles the
 * promise, which would leave the UI spinning forever.
 */
const ENABLE_TIMEOUT_MS = 60_000;

/** Must run from a click: `enable()` opens the wallet's popup. */
export async function connect(key: string): Promise<FullApi> {
    const wallet = window.cardano?.[key];
    if (!isInitialApi(wallet)) throw new Error(`Wallet "${key}" is not available.`);

    let timer: ReturnType<typeof setTimeout>;

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () =>
                reject(
                    new Error(
                        "The wallet did not answer. Open it, make sure a wallet is loaded and set as the dApp account, then try again.",
                    ),
                ),
            ENABLE_TIMEOUT_MS,
        );
    });

    try {
        return await Promise.race([wallet.enable(), timeout]);
    } finally {
        clearTimeout(timer!);
    }
}

/** True when the wallet already trusts this page, so reconnecting needs no popup. */
export async function isEnabled(key: string): Promise<boolean> {
    const wallet = window.cardano?.[key];
    if (!isInitialApi(wallet)) return false;

    try {
        return await wallet.isEnabled();
    } catch {
        return false;
    }
}

/**
 * CIP-30 rejects with `{ code, info }` rather than an Error. The codes worth
 * naming are the two that mean "the user said no", which is not a failure.
 */
export function walletErrorMessage(err: unknown): string {
    if (typeof err === "object" && err !== null && "code" in err) {
        const { code, info } = err as { code: number; info?: string };

        if (code === -3) return "Connection refused in the wallet.";
        if (code === -2) return "Signing cancelled in the wallet.";
        if (code === -1) return info ?? "The wallet rejected the request.";
        if (code === 1) return "The wallet is not ready yet. Unlock it and try again.";

        return info ?? `Wallet error ${code}.`;
    }

    return err instanceof Error ? err.message : String(err);
}
