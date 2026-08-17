// One shared timeline for every language service.
const HISTORY_PATH = "../../data/history.json";

export interface HistoryEntry {
    txHash: string;
    message: string;
    lovelace: string;
    to: string;
    sentAt: string;
}

export async function readHistory(): Promise<HistoryEntry[]> {
    const file = Bun.file(HISTORY_PATH);
    if (!(await file.exists())) return [];

    try {
        return await file.json();
    } catch {
        // A corrupted file should not take the server down.
        return [];
    }
}

/** Prepends an entry so the newest transaction is always first. */
export async function addToHistory(entry: HistoryEntry): Promise<void> {
    const history = await readHistory();
    history.unshift(entry);
    await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2));
}
