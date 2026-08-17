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
    let body = serde_json::json!({"_addresses": [wallet.base_address]});

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

}

