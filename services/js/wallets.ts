import { CclBridge, TESTNET } from "@bloxbean/cardano-client-lib";

export interface Wallet {
    base_address: string;
    stake_address: string;
    mnemonic: string;
}

export async function loadOrCreateWallet(path: string, bridge: CclBridge): Promise<Wallet> {
    const file = Bun.file(path);

    if (await file.exists()) {
        return await file.json();
    }

    const account = bridge.account.create(TESTNET);
    const wallet: Wallet = {
        base_address: account.base_address,
        stake_address: account.stake_address,
        mnemonic: account.mnemonic,
    };
    await Bun.write(path, JSON.stringify(wallet, null, 2));
    return wallet;
}
