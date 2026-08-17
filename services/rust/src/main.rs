use ccl::Bridge;




#[derive(serde::Deserialize)]
struct Wallet {
    base_address: String,
    mnemonic: String,
    }


#[derive(serde::Deserialize)]
struct AddressInfo {
    balance: String,
}

#[tokio::main]
async fn main() {
    let bridge = Bridge::new().unwrap();
    println!("bridge is running :)");
    println!("Hello, world!");
    let text = std::fs::read_to_string("../../wallets/sender.json").unwrap();
    let wallet: Wallet = serde_json::from_str(&text).unwrap();
    println!("{}", wallet.base_address);

    let client = reqwest::Client::new();
    let body = serde_json::json!({"_addresses": [&wallet.base_address]});

    let infos: Vec<AddressInfo> = client
        .post("https://preprod.koios.rest/api/v1/address_info")
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    println!("balance: {}", infos[0].balance);

    let utxos = koios_utxos(&wallet.base_address).await;
    println!("{:#?}", utxos);

}

async fn koios_utxos(address: &str) -> serde_json::Value {
    let client = reqwest::Client::new();
    let body = serde_json::json!({"_addresses": [address]});

    let raw: Vec<serde_json::Value> = client
        .post("https://preprod.koios.rest/api/v1/address_utxos")
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let mapped: Vec<serde_json::Value> = raw
        .iter()
        .map(|u| {
            serde_json::json!({
                "tx_hash": u["tx_hash"],
                "output_index": u["tx_index"],
                "address": u["address"],
                "amount": [{ "unit": "lovelace", "quantity": u["value"] }],
                "data_hash": u["datum_hash"],
                "reference_script_hash": u["reference_script"],
            })
        })
        .collect();

    serde_json::json!(mapped)
}