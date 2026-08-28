import { DEFAULT_SERVICE, serviceByKey } from "./services";
import type { ServiceKey } from "./services";

/**
 * Which backend the app talks to. Kept here rather than threaded through every
 * call: the choice is global to the page, and every request follows it.
 */
let active = serviceByKey(DEFAULT_SERVICE);

export function setService(key: ServiceKey) {
    active = serviceByKey(key);
}

export interface Info {
    sender: string;
    receiver: string;
    network: string;
    balance: string | null;
    maxMessageBytes: number;
}

export interface HistoryEntry {
    txHash: string;
    message: string;
    lovelace: string;
    to: string;
    sentAt: string;
    confirmations: number;
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;

    try {
        res = await fetch(`${active.url}${path}`, init);
    } catch {
        throw new ApiError(`The ${active.label} service is not answering on ${active.url}. Is it running?`);
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        throw new ApiError((data as { error?: string })?.error ?? `Request failed (${res.status})`);
    }

    return data as T;
}

export function getInfo() {
    return request<Info>("/api/info");
}

export function getHistory() {
    return request<HistoryEntry[]>("/api/history");
}

export function sendPostcard(message: string, ada: number) {
    return request<{ txHash: string }>("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ada }),
    });
}

/** Converts the hex address a CIP-30 wallet returns and reports what it holds. */
export function resolveAddress(addressHex: string) {
    return request<{ address: string; balance: string | null }>("/api/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressHex }),
    });
}

/** Current balance of an address that has already been resolved. */
export function getAddressBalance(address: string) {
    return request<{ address: string; balance: string | null }>("/api/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
    });
}

/** Browser-wallet flow, step one: an unsigned transaction paid for by `address`. */
export function buildPostcard(message: string, ada: number, address: string) {
    return request<{ txCbor: string; txHash: string; fee: string }>("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ada, address }),
    });
}

/** Step two: the witness set from the wallet is attached and the result submitted. */
export function submitPostcard(txCbor: string, witnessSet: string) {
    return request<{ txHash: string }>("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txCbor, witnessSet }),
    });
}

export function explorerUrl(txHash: string) {
    return `https://preprod.cardanoscan.io/transaction/${txHash}`;
}
