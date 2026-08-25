/**
 * The three backends. They all implement the same contract (docs/api.md), so the
 * app only swaps the base URL. Which language answers is invisible to everything
 * except this file.
 */

export type ServiceKey = "js" | "rust" | "go";

export interface Service {
    key: ServiceKey;
    label: string;
    url: string;
    /** Whether this service implements the CIP-30 endpoints yet. */
    wallet: boolean;
}

export const SERVICES: Service[] = [
    { key: "js", label: "JavaScript", url: "http://localhost:3001", wallet: true },
    { key: "rust", label: "Rust", url: "http://localhost:3002", wallet: false },
    { key: "go", label: "Go", url: "http://localhost:3003", wallet: false },
];

export const DEFAULT_SERVICE: ServiceKey = "js";

export function serviceByKey(key: ServiceKey): Service {
    return SERVICES.find((s) => s.key === key) ?? SERVICES[0]!;
}
