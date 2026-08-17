import type { HistoryEntry } from "../lib/api";
import { explorerUrl } from "../lib/api";
import {
    confirmationState,
    formatAda,
    formatDateTime,
    formatRelative,
    shortHash,
    SETTLED_AFTER,
} from "../lib/format";
import { CheckIcon, ClockIcon, ExternalLinkIcon } from "./Icons";

const STATE_LABEL = {
    pending: "In mempool",
    confirming: "Confirming",
    settled: "Settled",
} as const;

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
    if (entries.length === 0) {
        return (
            <div className="empty-state">
                <p>No postcards sent yet.</p>
                <p className="muted">Your first message will appear here once it hits the chain.</p>
            </div>
        );
    }

    return (
        <ol className="timeline">
            {entries.map((entry) => {
                const state = confirmationState(entry.confirmations);
                const progress = Math.min(entry.confirmations / SETTLED_AFTER, 1);

                return (
                    <li key={entry.txHash} className="timeline-item">
                        <span className={`dot dot-${state}`} aria-hidden />

                        <article className="tx-card">
                            <header>
                                <span className={`status status-${state}`}>
                                    {state === "settled" ? <CheckIcon /> : <ClockIcon />}
                                    {STATE_LABEL[state]}
                                </span>
                                <time dateTime={entry.sentAt} title={formatDateTime(entry.sentAt)}>
                                    {formatRelative(entry.sentAt)}
                                </time>
                            </header>

                            <blockquote>{entry.message}</blockquote>

                            {state !== "settled" && (
                                <div
                                    className="progress"
                                    role="progressbar"
                                    aria-valuenow={entry.confirmations}
                                    aria-valuemin={0}
                                    aria-valuemax={SETTLED_AFTER}
                                    aria-label="Confirmations until settled"
                                >
                                    <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
                                </div>
                            )}

                            <footer>
                                <span className="amount">{formatAda(entry.lovelace)} ADA</span>
                                <span className="dot-sep" aria-hidden>
                                    ·
                                </span>
                                <span className="confirmations">
                                    {entry.confirmations === 0
                                        ? "awaiting first block"
                                        : `${entry.confirmations} confirmation${entry.confirmations === 1 ? "" : "s"}`}
                                </span>
                                <a
                                    href={explorerUrl(entry.txHash)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="tx-link"
                                >
                                    {shortHash(entry.txHash)}
                                    <ExternalLinkIcon />
                                </a>
                            </footer>
                        </article>
                    </li>
                );
            })}
        </ol>
    );
}
