import { CclBridge, TESTNET } from "@bloxbean/cardano-client-lib";
import { KoiosProvider } from "./koios-provider";

interface Wallet {
    base_address: string;
    stake_adress: string;
    mnemonic: string;
}

async function loadOrCreateWallet(path: string, bridge: CclBridge):
Promise<Wallet> {
    const file = Bun.file(path);

    if (await file.exists()) {
        return await file.json();
    }

    const account = bridge.account.create(TESTNET);
    const wallet: Wallet = {
        base_address: account.base_address,
        stake_adress: account.stake_address,
        mnemonic: account.mnemonic,
    };
    await Bun.write(path, JSON.stringify(wallet, null, 2));
    return wallet;
}

using bridge = new CclBridge();

const sender = await loadOrCreateWallet("wallets/sender.json", bridge);
const receiver = await loadOrCreateWallet("wallets/receiver.json", bridge);

console.log("Sender Adress: ", sender.base_address);
console.log("Receiver Adress: ", receiver.base_address);

const provider = new KoiosProvider();


// 1. Describe — TxPlan YAML (see the intent catalog)
const yaml = `
version: 1.0
transaction:
  - tx:
      from: ${sender.base_address}
      intents:
        - type: payment
          address: ${receiver.base_address}
          amounts:
            - unit: lovelace
              quantity: "5000000"
        - type: metadata
          metadata: '{"674": {"msg": "She call mi Mr. Boombastic Tell mi fantastic"}}'
`;

// 2. Build — offline; UTXO selection, fee, and change happen in the native lib
const result = await bridge.quicktx.buildWith(yaml, provider, sender.base_address);
// (or bridge.quicktx.build(yaml, utxos, protocolParams) with your own chain data)

// 3. Sign — with the key roles the transaction's certificates require
const signed = bridge.account.signTx(sender.mnemonic, TESTNET, 0, 0, result.tx_cbor);

// 4. Submit — any Blockfrost-compatible endpoint; the library never submits
const resp = await fetch(`https://preprod.koios.rest/api/v1/submittx`, {
    method: "POST",
    headers: { "Content-Type": "application/cbor" },
    body: Buffer.from(signed, "hex"),
});
if (!resp.ok) throw new Error(`rejected: ${await resp.text()}`);
const txHash = (await resp.text()).trim().replace(/"/g, "");

console.log("Transaction hash:", txHash);