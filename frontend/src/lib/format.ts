export const LOVELACE_PER_ADA = 1_000_000;

export function lovelaceToAda(lovelace: string | number) {
    return Number(lovelace) / LOVELACE_PER_ADA;
}

export function formatAda(lovelace: string | number, maximumFractionDigits = 2) {
    return lovelaceToAda(lovelace).toLocaleString(undefined, { maximumFractionDigits });
}

/** Cardano counts metadata in UTF-8 bytes, where an emoji costs more than one. */
export function byteLength(text: string) {
    return new TextEncoder().encode(text).length;
}

export function shortHash(hash: string) {
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatRelative(iso: string) {
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * A transaction is treated as settled once the chain has stacked enough blocks
 * on top of it that a rollback is practically impossible.
 */
export const SETTLED_AFTER = 10;

export function confirmationState(confirmations: number) {
    if (confirmations === 0) return "pending" as const;
    if (confirmations < SETTLED_AFTER) return "confirming" as const;
    return "settled" as const;
}
