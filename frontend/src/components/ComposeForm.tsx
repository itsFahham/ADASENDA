import { useState } from "react";
import { byteLength } from "../lib/format";
import { SendIcon, SpinnerIcon } from "./Icons";

interface Props {
    maxBytes: number;
    isSending: boolean;
    /** True while an earlier transaction has not reached a block yet. */
    isBlocked: boolean;
    /** Overrides the button text when something other than a pending block blocks sending. */
    blockedLabel?: string;
    blockedHint?: string;
    onSend: (message: string, ada: number) => void;
}

const QUICK_AMOUNTS = [1, 5, 10];

export function ComposeForm({
    maxBytes,
    isSending,
    isBlocked,
    blockedLabel,
    blockedHint,
    onSend,
}: Props) {
    const [message, setMessage] = useState("");
    const [ada, setAda] = useState("5");

    const usedBytes = byteLength(message);
    const isTooLong = usedBytes > maxBytes;
    const amount = Number(ada);
    const isAmountValid = Number.isFinite(amount) && amount >= 1;
    const canSend =
        message.trim().length > 0 && !isTooLong && isAmountValid && !isSending && !isBlocked;

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!canSend) return;
        onSend(message, amount);
        setMessage("");
    }

    return (
        <form className="panel compose" onSubmit={handleSubmit}>
            <div className="panel-head">
                <h2>Write a postcard</h2>
                <span className={`bytes${isTooLong ? " is-error" : ""}`}>
                    {usedBytes}/{maxBytes} bytes
                </span>
            </div>

            <label htmlFor="message" className="field-label">
                Message
            </label>
            <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Something worth keeping forever…"
                rows={3}
                disabled={isSending}
                aria-invalid={isTooLong}
                aria-describedby="message-help"
            />
            <p id="message-help" className={`field-help${isTooLong ? " is-error" : ""}`}>
                {isTooLong
                    ? `${usedBytes - maxBytes} bytes over the limit. Cardano caps a metadata string at ${maxBytes} bytes.`
                    : "Stored on-chain as CIP-20 metadata. Emoji and umlauts cost more than one byte."}
            </p>

            <label htmlFor="amount" className="field-label">
                Amount
            </label>
            <div className="amount-row">
                <div className="amount-input">
                    <input
                        id="amount"
                        type="number"
                        min="1"
                        step="1"
                        value={ada}
                        onChange={(e) => setAda(e.target.value)}
                        disabled={isSending}
                        aria-invalid={!isAmountValid}
                    />
                    <span className="suffix">ADA</span>
                </div>
                <div className="quick-amounts">
                    {QUICK_AMOUNTS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            className={`chip${amount === value ? " is-active" : ""}`}
                            onClick={() => setAda(String(value))}
                            disabled={isSending}
                        >
                            {value}
                        </button>
                    ))}
                </div>
            </div>
            {!isAmountValid && <p className="field-help is-error">Minimum is 1 ADA.</p>}

            <button type="submit" className="primary" disabled={!canSend}>
                {isSending || isBlocked ? <SpinnerIcon /> : <SendIcon />}
                {isSending
                    ? "Submitting to the chain…"
                    : isBlocked
                      ? (blockedLabel ?? "Waiting for the previous block…")
                      : "Send postcard"}
            </button>

            {isBlocked && !isSending && (
                <p className="field-help hint-blocked">
                    {blockedHint ??
                        "Your last postcard is still in the mempool. Its funds stay locked until a block picks it up, so the next one has to wait roughly 20 seconds."}
                </p>
            )}
        </form>
    );
}
