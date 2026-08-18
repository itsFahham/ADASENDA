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

    let sender_text = std::fs::read_to_string("../../wallets/sender.json").unwrap();
    let sender: Wallet = serde_json::from_str(&sender_text).unwrap();

    let receiver_text = std::fs::read_to_string("../../wallets/receiver.json").unwrap();
    let receiver: Wallet = serde_json::from_str(&receiver_text).unwrap();

    println!("from: {}", sender.base_address);
    println!("to  : {}", receiver.base_address);


    let yaml = format!(
        r#"
version: 1.0
transaction:
  - tx:
      from: {}
      intents:
        - type: payment
          address: {}
          amounts:
            - unit: lovelace
              quantity: "5000000"
        - type: metadata
          metadata: '{{"674": {{"msg": "hallo aus rust"}}}}'
"#,
        sender.base_address, receiver.base_address
    );

    let utxos = koios_utxos(&sender.base_address).await;
    println!("{:#?}", utxos);

    let pp = koios_protocol_params().await;
    println!("min_fee_a: {}", pp["min_fee_a"]);
    let result = bridge.quicktx().build(&yaml, &utxos, &pp, None).unwrap();

    println!("tx hash: {}", result.tx_hash);
    println!("fee    : {}", result.fee);
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

async fn koios_protocol_params() -> serde_json::Value {
    let client = reqwest::Client::new();

    let mut params: Vec<serde_json::Value> = client
        .get("https://preprod.koios.rest/api/v1/epoch_params")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let mut first = params.remove(0);

    let cost_models = first["cost_models"].take();
    first["cost_models_raw"] = cost_models;

    first
}