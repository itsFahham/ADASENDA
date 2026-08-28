import { CclBridge, TESTNET } from "@bloxbean/cardano-client-lib";
import { KoiosProvider } from "./koios-provider";
import type { Wallet } from "./wallets";

function metadataScalar(message: string): string {
    return JSON.stringify({ "674": { msg: message } }).replace(/'/g, "''");
}


export async function buildUnsigned(
    bridge: CclBridge,
    provider: KoiosProvider,
    from: string,
    to: string,
    message: string,
    lovelace: string,
): Promise<{ txCbor: string; txHash: string; fee: string }> {
    const yaml = `
version: 1.0
transaction:
  - tx:
      from: ${from}
      intents:
        - type: payment
          address: ${to}
          amounts:
            - unit: lovelace
              quantity: "${lovelace}"
        - type: metadata
          metadata: '${metadataScalar(message)}'
`;

    const result = await bridge.quicktx.buildWith(yaml, provider, from);

    return { txCbor: result.tx_cbor, txHash: result.tx_hash, fee: result.fee };
}

export async function sendMessage(
    bridge: CclBridge,
    sender: Wallet,
    receiver: Wallet,
    message: string,
    lovelace: string = "5000000",
): Promise<string> {
    const provider = new KoiosProvider();

    const { txCbor } = await buildUnsigned(
        bridge,
        provider,
        sender.base_address,
        receiver.base_address,
        message,
        lovelace,
    );

    const signed = bridge.account.signTx(sender.mnemonic, TESTNET, 0, 0, txCbor);

    return await provider.submit(signed);
}
