import { CclBridge } from "@bloxbean/cardano-client-lib";
import { loadOrCreateWallet } from "./wallets";
import { sendMessage, buildUnsigned } from "./send";
import { KoiosProvider } from "./koios-provider";
import { readHistory, addToHistory } from "./history";
import { attachWitnessSet, unwrapAddressHex } from "./cbor";

const bridge = new CclBridge();
const provider = new KoiosProvider();

// The wallets live above the services so every language service shares them.
const sender = await loadOrCreateWallet("../../wallets/sender.json", bridge);
const receiver = await loadOrCreateWallet("../../wallets/receiver.json", bridge);

// Cardano stores a metadata string as UTF-8 and rejects anything above 64 bytes.
const MAX_MESSAGE_BYTES = 64;
const MIN_LOVELACE = 1_000_000;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * What each pending browser-wallet transaction is about, keyed by the CBOR we
 * handed out. The history entry is written on submit, and taking its contents
 * from here rather than from the request keeps the client from writing whatever
 * it likes into the timeline.
 */
const pendingBuilds = new Map<string, { message: string; lovelace: string; to: string }>();

function jsonError(message: string, status: number) {
    return Response.json({ error: message }, { status, headers: CORS_HEADERS });
}

/**
 * Koios only reports UTXOs that are already on-chain, so sending again before
 * the previous transaction is in a block reuses inputs it has already spent.
 * The node rejects that with a wall of JSON, so translate the common cases.
 */
function readableSubmitError(err: unknown): { message: string; status: number } {
    const raw = String(err);

    if (raw.includes("All inputs are spent") || raw.includes("BadInputsUTxO")) {
        return {
            message:
                "The previous transaction has not reached a block yet, so its funds are still locked. Wait for one confirmation and try again.",
            status: 409,
        };
    }

    if (raw.includes("ValueNotConservedUTxO") || raw.includes("CCL Error -8")) {
        return { message: "Not enough funds to cover this amount plus the fee.", status: 400 };
    }

    if (raw.includes("OutputTooSmallUTxO")) {
        return { message: "Amount is below the minimum a Cardano output may hold.", status: 400 };
    }

    return { message: raw, status: 500 };
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
    try {
        return (await req.json()) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/** Shared by both send paths, so a browser wallet cannot slip past the limits. */
function validate(body: Record<string, unknown>): { message: string; lovelace: string } | string {
    const message = body.message;
    if (!message || typeof message !== "string") return "message is required";

    const byteLength = new TextEncoder().encode(message).length;
    if (byteLength > MAX_MESSAGE_BYTES) {
        return `message is ${byteLength} bytes, limit is ${MAX_MESSAGE_BYTES}`;
    }

    const ada = body.ada ?? 5;
    if (typeof ada !== "number" || !Number.isFinite(ada) || ada <= 0) {
        return "ada must be a positive number";
    }

    const lovelace = Math.round(ada * 1_000_000);
    if (lovelace < MIN_LOVELACE) return "amount must be at least 1 ADA";

    return { message, lovelace: String(lovelace) };
}

Bun.serve({
    port: 3001,
    async fetch(req) {
        const url = new URL(req.url);

        if (req.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        if (req.method === "GET" && url.pathname === "/api/info") {
            let balance = null;
            try {
                balance = await provider.balance(sender.base_address);
            } catch {
                // The UI can still work without a balance, so this is not fatal.
            }

            return Response.json(
                {
                    sender: sender.base_address,
                    receiver: receiver.base_address,
                    network: "preprod",
                    balance,
                    maxMessageBytes: MAX_MESSAGE_BYTES,
                },
                { headers: CORS_HEADERS },
            );
        }

        if (req.method === "GET" && url.pathname === "/api/history") {
            const history = await readHistory();

            let confirmations: Record<string, number> = {};
            try {
                confirmations = await provider.confirmations(history.map((h) => h.txHash));
            } catch {
                // Show the history even when Koios is unreachable.
            }

            return Response.json(
                history.map((entry) => ({
                    ...entry,
                    confirmations: confirmations[entry.txHash] ?? 0,
                })),
                { headers: CORS_HEADERS },
            );
        }

        // Turns the `cbor<address>` hex a CIP-30 wallet returns into something
        // readable, and reports what that address holds.
        if (req.method === "POST" && url.pathname === "/api/address") {
            const body = await readJson(req);
            if (!body) return jsonError("invalid JSON body", 400);

            // Hex on connect, bech32 when the UI only wants a fresh balance.
            const addressHex = body.addressHex;
            const bech32 = body.address;
            if (typeof addressHex !== "string" && typeof bech32 !== "string") {
                return jsonError("addressHex or address is required", 400);
            }

            let address: string;
            try {
                address =
                    typeof bech32 === "string"
                        ? bech32
                        : bridge.address.fromBytes(unwrapAddressHex(addressHex as string));

                if (!bridge.address.validate(address)) throw new Error("invalid address");
            } catch {
                return jsonError("that is not a Cardano address", 400);
            }

            const info = bridge.address.info(address);
            if (info.network_id !== 0) {
                return jsonError("That wallet is on mainnet. Switch it to preprod.", 400);
            }

            let balance: string | null = null;
            try {
                balance = await provider.balance(address);
            } catch {
                // Koios being down should not stop the wallet from connecting.
            }

            return Response.json({ address, balance }, { headers: CORS_HEADERS });
        }

        // Step one of the browser-wallet flow: build, but do not sign.
        if (req.method === "POST" && url.pathname === "/api/build") {
            const body = await readJson(req);
            if (!body) return jsonError("invalid JSON body", 400);

            const checked = validate(body);
            if (typeof checked === "string") return jsonError(checked, 400);

            const from = body.address;
            if (!from || typeof from !== "string") return jsonError("address is required", 400);

            try {
                const built = await buildUnsigned(
                    bridge,
                    provider,
                    from,
                    receiver.base_address,
                    checked.message,
                    checked.lovelace,
                );

                pendingBuilds.set(built.txCbor, {
                    message: checked.message,
                    lovelace: checked.lovelace,
                    to: receiver.base_address,
                });

                return Response.json(built, { headers: CORS_HEADERS });
            } catch (err) {
                const { message, status } = readableSubmitError(err);
                return jsonError(message, status);
            }
        }

        // Step two: the wallet has signed, so attach its witness set and submit.
        if (req.method === "POST" && url.pathname === "/api/submit") {
            const body = await readJson(req);
            if (!body) return jsonError("invalid JSON body", 400);

            const txCbor = body.txCbor;
            const witnessSet = body.witnessSet;
            if (typeof txCbor !== "string" || typeof witnessSet !== "string") {
                return jsonError("txCbor and witnessSet are required", 400);
            }

            const pending = pendingBuilds.get(txCbor);
            if (!pending) return jsonError("unknown transaction, build it again", 400);

            try {
                const signed = attachWitnessSet(txCbor, witnessSet);
                const txHash = await provider.submit(signed);

                pendingBuilds.delete(txCbor);
                await addToHistory({
                    txHash,
                    message: pending.message,
                    lovelace: pending.lovelace,
                    to: pending.to,
                    sentAt: new Date().toISOString(),
                });

                return Response.json({ txHash }, { headers: CORS_HEADERS });
            } catch (err) {
                const { message, status } = readableSubmitError(err);
                return jsonError(message, status);
            }
        }

        if (req.method === "POST" && url.pathname === "/api/send") {
            const body = await readJson(req);
            if (!body) return jsonError("invalid JSON body", 400);

            const checked = validate(body);
            if (typeof checked === "string") return jsonError(checked, 400);

            try {
                const txHash = await sendMessage(
                    bridge,
                    sender,
                    receiver,
                    checked.message,
                    checked.lovelace,
                );

                await addToHistory({
                    txHash,
                    message: checked.message,
                    lovelace: checked.lovelace,
                    to: receiver.base_address,
                    sentAt: new Date().toISOString(),
                });

                return Response.json({ txHash }, { headers: CORS_HEADERS });
            } catch (err) {
                const { message, status } = readableSubmitError(err);
                return jsonError(message, status);
            }
        }

        return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    },
});

console.log("Server running on http://localhost:3001");
console.log("Sender address:  ", sender.base_address);
console.log("Receiver address:", receiver.base_address);
