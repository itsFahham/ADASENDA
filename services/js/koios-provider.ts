import type { Utxo, ProtocolParams } from "@bloxbean/cardano-client-lib"

const KOIOS_BASE_URL = "https://preprod.koios.rest/api/v1"

export class KoiosProvider {
    async utxos(address: string): Promise<Utxo[]> {
        const res = await fetch(`${KOIOS_BASE_URL}/address_utxos`, {
            method: 'POST',
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ _addresses: [address] }),
        });

        const items = (await res.json()) as any[];

        return items.map((u: any) => ({
            tx_hash: u.tx_hash,
            output_index: u.tx_index,
            address: u.address,
            amount: [{ unit: "lovelace", quantity: u.value }],
            data_hash: u.datum_hash,
            reference_script_hash: u.reference_script,
        }));
    }

    /** Total lovelace held by an address. */
    async balance(address: string): Promise<string> {
        const res = await fetch(`${KOIOS_BASE_URL}/address_info`, {
            method: 'POST',
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ _addresses: [address] }),
        });

        const [info] = (await res.json()) as any[];
        return info?.balance ?? "0";
    }

    /** Confirmation count per transaction hash; unknown hashes are left out. */
    async confirmations(txHashes: string[]): Promise<Record<string, number>> {
        if (txHashes.length === 0) return {};

        const res = await fetch(`${KOIOS_BASE_URL}/tx_status`, {
            method: 'POST',
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ _tx_hashes: txHashes }),
        });

        const items = (await res.json()) as any[];

        const result: Record<string, number> = {};
        for (const item of items) {
            result[item.tx_hash] = item.num_confirmations ?? 0;
        }
        return result;
    }

    /** Submits a signed transaction and returns its hash. */
    async submit(txCborHex: string): Promise<string> {
        const res = await fetch(`${KOIOS_BASE_URL}/submittx`, {
            method: 'POST',
            headers: {"Content-Type": "application/cbor"},
            body: Buffer.from(txCborHex, "hex"),
        });

        const body = (await res.text()).trim();
        if (!res.ok) throw new Error(`rejected: ${body}`);

        return body.replace(/"/g, "");
    }

    async protocolParams(): Promise<ProtocolParams> {
        const res = await fetch(`${KOIOS_BASE_URL}/epoch_params`);
        const [params] = (await res.json()) as ProtocolParams[];
        if (!params) throw new Error("Koios returned no protocol parameters");
        const { cost_models, ...rest } = params as any;
        return { ...rest, cost_models_raw: cost_models };
    }
}

