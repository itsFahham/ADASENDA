use serde_json::json;
use axum::{extract::State, routing::get, Json, Router};

#[derive(Clone)]
struct AppState {
    sender_addr : String,
    receiver_addr : String,
}

#[tokio::main]
async fn main(){

    let sender_text = std::fs::read_to_string("../../wallets/sender.json").unwrap();
    let sender: serde_json::Value = serde_json::from_str(&sender_text).unwrap();
    let sender_addr = sender["base_address"].as_str().unwrap().to_string();

    let receiver_text = std::fs::read_to_string("../../wallets/receiver.json").unwrap();
    let receiver: serde_json::Value = serde_json::from_str(&receiver_text).unwrap();
    let receiver_addr = receiver["base_address"].as_str().unwrap().to_string();

    let state = AppState {sender_addr, receiver_addr};

    let app = Router::new()
        .route("/api/info", get(info))
        .with_state(state);

    let listener =
tokio::net::TcpListener::bind("0.0.0.0:3002").await.unwrap();
    axum::serve(listener, app).await.unwrap();


    }

async fn info(State(state): State<AppState>) -> Json<serde_json::Value> {
    let bal = balance(&state.sender_addr);
    Json(json!({
        "sender": state.sender_addr,
        "receiver": state.receiver_addr,
        "network": "preprod",
        "balance": bal,
        "maxMessageBytes": 64,
    }))
}

fn balance(address: &str) -> Option<String> {
    let arr: Vec<serde_json::Value> =
        ureq::post("https://preprod.koios.rest/api/v1/address_info")
            .send_json(json!({ "_addresses": [address] })).ok()?
            .into_json().ok()?;
    arr.first()?["balance"].as_str().map(String::from)
}