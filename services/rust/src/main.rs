use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use ccl::Bridge;
use ccl::Network;
use ccl::providers::ChainDataProvider;
use chrono::Utc;
use serde_json::Value;
use serde_json::json;
use std::thread;
use tokio::sync::{mpsc, oneshot};

#[derive(Clone)]
struct AppState {
    sender_addr: String,
    receiver_addr: String,
    jobs: mpsc::Sender<Job>,
}

enum Job {
    Send {
        message: String,
        lovelace: String,
        reply: oneshot::Sender<Result<String, String>>,
    },
}

#[tokio::main]
async fn main() {
    // 1. read the wallets
    let sender_text = std::fs::read_to_string("../../wallets/sender.json").unwrap();
    let sender: Value = serde_json::from_str(&sender_text).unwrap();
    let sender_addr = sender["base_address"].as_str().unwrap().to_string();
    let sender_mnemonic = sender["mnemonic"].as_str().unwrap().to_string();

    let receiver_text = std::fs::read_to_string("../../wallets/receiver.json").unwrap();
    let receiver: Value = serde_json::from_str(&receiver_text).unwrap();
    let receiver_addr = receiver["base_address"].as_str().unwrap().to_string();

    // 2. start the bridge worker with everything it needs to send
    let (job_tx, mut job_rx) = mpsc::channel::<Job>(16);
    let w_sender = sender_addr.clone();
    let w_receiver = receiver_addr.clone();
    thread::spawn(move || {
        let bridge = Bridge::new().expect("bridge failed to start");
        while let Some(job) = job_rx.blocking_recv() {
            match job {
                Job::Send {
                    message,
                    lovelace,
                    reply,
                } => {
                    let result = do_send(
                        &bridge,
                        &sender_mnemonic,
                        &w_sender,
                        &w_receiver,
                        &message,
                        &lovelace,
                    );
                    let _ = reply.send(result);
                }
            }
        }
    });

    // 3. start the server
    let state = AppState {
        sender_addr,
        receiver_addr,
        jobs: job_tx,
    };
    let app = Router::new()
        .route("/api/info", get(info))
        .route("/api/send", post(send))
        .route("/api/history", get(history))
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3002").await.unwrap();
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

// POST /api/send
async fn send(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let message = body["message"].as_str().unwrap_or("");
    let ada = body["ada"].as_f64().unwrap_or(0.0);

    // validation, same rules as the other services
    if message.len() > 64 {
        return Err(fail(
            StatusCode::BAD_REQUEST,
            "message too long (max 64 bytes)",
        ));
    }
    if ada < 1.0 {
        return Err(fail(StatusCode::BAD_REQUEST, "minimum is 1 ADA"));
    }
    let lovelace = ((ada * 1_000_000.0) as u64).to_string();

    // hand the job to the bridge worker and wait for its reply
    let (reply_tx, reply_rx) = oneshot::channel();
    state
        .jobs
        .send(Job::Send {
            message: message.to_string(),
            lovelace,
            reply: reply_tx,
        })
        .await
        .map_err(|_| fail(StatusCode::INTERNAL_SERVER_ERROR, "worker gone"))?;

    match reply_rx
        .await
        .map_err(|_| fail(StatusCode::INTERNAL_SERVER_ERROR, "no reply"))?
    {
        Ok(tx_hash) => Ok(Json(json!({ "txHash": tx_hash }))),
        Err(e) => Err(fail(StatusCode::INTERNAL_SERVER_ERROR, &e)),
    }
}

fn fail(code: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (code, Json(json!({ "error": message })))
}

fn balance(address: &str) -> Option<String> {
    let arr: Vec<serde_json::Value> = ureq::post("https://preprod.koios.rest/api/v1/address_info")
        .send_json(json!({ "_addresses": [address] }))
        .ok()?
        .into_json()
        .ok()?;
    arr.first()?["balance"].as_str().map(String::from)
}

const KOIOS: &str = "https://preprod.koios.rest/api/v1";

struct KoiosProvider;

impl ChainDataProvider for KoiosProvider {
    fn utxos(&self, address: &str) -> ccl::Result<Value> {
        let raw: Vec<Value> = ureq::post(&format!("{KOIOS}/address_utxos"))
            .send_json(json!({ "_addresses": [address] }))
            .map_err(koios_err)?
            .into_json()
            .map_err(koios_err)?;

        let mapped: Vec<Value> = raw
            .iter()
            .map(|u| {
                json!({
                    "tx_hash": u["tx_hash"],
                    "output_index": u["tx_index"],
                    "address": u["address"],
                    "amount": [{ "unit": "lovelace", "quantity": u["value"] }],
                    "data_hash": u["datum_hash"],
                    "reference_script_hash": u["reference_script"],
                })
            })
            .collect();

        Ok(json!(mapped))
    }

    fn protocol_params(&self) -> ccl::Result<Value> {
        let mut params: Vec<Value> = ureq::get(&format!("{KOIOS}/epoch_params"))
            .call()
            .map_err(koios_err)?
            .into_json()
            .map_err(koios_err)?;
        let mut first = params.remove(0);
        first["cost_models_raw"] = first["cost_models"].take();
        Ok(first)
    }
}

fn koios_err<E: std::fmt::Display>(e: E) -> ccl::CclError {
    ccl::CclError {
        code: -1,
        message: format!("koios: {e}"),
    }
}

fn do_send(
    bridge: &Bridge,
    mnemonic: &str,
    sender_addr: &str,
    receiver_addr: &str,
    message: &str,
    lovelace: &str,
) -> Result<String, String> {
    let yaml = build_yaml(sender_addr, receiver_addr, message, lovelace);
    let provider = KoiosProvider;

    let built = bridge
        .quicktx()
        .build_with(&yaml, &provider, sender_addr, None)
        .map_err(|e| e.message)?;

    let signed = bridge
        .account()
        .sign_tx(mnemonic, Network::Testnet, 0, 0, &built.tx_cbor)
        .map_err(|e| e.message)?;

    let tx_hash = submit(&signed)?;
    append_history(&tx_hash, message, lovelace, receiver_addr);
    Ok(tx_hash)
}

fn build_yaml(from: &str, to: &str, message: &str, lovelace: &str) -> String {
    let meta = serde_json::to_string(&json!({ "674": { "msg": message } }))
        .unwrap()
        .replace('\'', "''");
    format!(
        "version: 1.0\n\
         transaction:\n\
         \x20 - tx:\n\
         \x20     from: {from}\n\
         \x20     intents:\n\
         \x20       - type: payment\n\
         \x20         address: {to}\n\
         \x20         amounts:\n\
         \x20           - unit: lovelace\n\
         \x20             quantity: \"{lovelace}\"\n\
         \x20       - type: metadata\n\
         \x20         metadata: '{meta}'\n"
    )
}

// Submit the signed tx to Koios; the body is raw CBOR bytes, not hex.
fn submit(signed_hex: &str) -> Result<String, String> {
    let bytes = hex_to_bytes(signed_hex)?;
    match ureq::post(&format!("{KOIOS}/submittx"))
        .set("Content-Type", "application/cbor")
        .send_bytes(&bytes)
    {
        Ok(r) => Ok(r
            .into_string()
            .unwrap_or_default()
            .trim()
            .trim_matches('"')
            .to_string()),
        Err(ureq::Error::Status(_, r)) => Err(r.into_string().unwrap_or_default()),
        Err(e) => Err(e.to_string()),
    }
}

fn hex_to_bytes(s: &str) -> Result<Vec<u8>, String> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

// GET /api/history
async fn history() -> Json<Value> {
    let text =
        std::fs::read_to_string("../../data/history.json").unwrap_or_else(|_| "[]".to_string());
    let mut list: Vec<Value> = serde_json::from_str(&text).unwrap_or_default();

    let hashes: Vec<String> = list
        .iter()
        .filter_map(|e| e["txHash"].as_str().map(String::from))
        .collect();
    let confs = confirmations(&hashes);

    for entry in &mut list {
        let h = entry["txHash"].as_str().unwrap_or("").to_string();
        entry["confirmations"] = json!(confs.get(&h).copied().unwrap_or(0));
    }

    Json(json!(list))
}

use std::collections::HashMap;

// Live confirmation count per tx hash from Koios; empty map if Koios is down.
fn confirmations(tx_hashes: &[String]) -> HashMap<String, i64> {
    let mut out = HashMap::new();
    if tx_hashes.is_empty() {
        return out;
    }
    let arr: Vec<Value> = match ureq::post(&format!("{KOIOS}/tx_status"))
        .send_json(json!({ "_tx_hashes": tx_hashes }))
        .ok()
        .and_then(|r| r.into_json().ok())
    {
        Some(a) => a,
        None => return out,
    };
    for item in &arr {
        if let Some(h) = item["tx_hash"].as_str() {
            out.insert(
                h.to_string(),
                item["num_confirmations"].as_i64().unwrap_or(0),
            );
        }
    }
    out
}

// Append a new postcard to the shared history file, newest first.
fn append_history(tx_hash: &str, message: &str, lovelace: &str, to: &str) {
    let entry = json!({
        "txHash": tx_hash,
        "message": message,
        "lovelace": lovelace,
        "to": to,
        "sentAt": Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        "confirmations": 0,
    });

    let text =
        std::fs::read_to_string("../../data/history.json").unwrap_or_else(|_| "[]".to_string());
    let mut list: Vec<Value> = serde_json::from_str(&text).unwrap_or_default();
    list.insert(0, entry); // newest first

    let _ = std::fs::write(
        "../../data/history.json",
        serde_json::to_string_pretty(&list).unwrap(),
    );
}
