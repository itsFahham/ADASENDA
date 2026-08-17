# Service API

Every language service implements this contract. The frontend only switches the base
URL, so anything specific to a language belongs inside the service, never in the wire
format.

| Service | Port |
|---|---|
| JavaScript (Bun) | 3001 |
| Rust | 3002 |
| Go | 3003 |

All services share the same state on disk:

```
wallets/sender.json     the generated wallet that signs in server mode
wallets/receiver.json   where every postcard is sent
data/history.json       one timeline for all services
```

## Rules

- Request and response bodies are JSON. Errors are `{ "error": "..." }` with a matching
  status code, never a bare string or an HTML page.
- **Lovelace amounts are strings**, never numbers. 5 ADA is `"5000000"`. They exceed what
  a double represents exactly, and JSON has no integers wide enough.
- `ada` in a request is the one exception: a plain number, because it is a human-scale
  input. The service converts and validates it.
- A message is at most **64 bytes of UTF-8**, not 64 characters. Count bytes.
- The minimum amount is **1 ADA**. Cardano rejects outputs below the minimum a UTXO may
  hold, and the exact bound depends on protocol parameters.
- CORS must be open (`Access-Control-Allow-Origin: *`) and `OPTIONS` answered, or the
  browser never reaches the service.
- The library never submits. Submission goes to Koios over HTTP from the service.

## GET /api/info

Addresses of the generated wallets and the limits the UI needs.

```json
{
  "sender": "addr_test1...",
  "receiver": "addr_test1...",
  "network": "preprod",
  "balance": "9989823983",
  "maxMessageBytes": 64
}
```

`balance` is the sender's total lovelace, or `null` when Koios is unreachable. A missing
balance must not fail the request: the UI stays usable without it.

## GET /api/history

Newest first. `confirmations` is looked up live and is `0` for a transaction that is
still in the mempool.

```json
[
  {
    "txHash": "1c9ad16f...",
    "message": "ola amigo",
    "lovelace": "5000000",
    "to": "addr_test1...",
    "sentAt": "2026-08-17T09:13:31.152Z",
    "confirmations": 1
  }
]
```

If Koios is unreachable, return the history with `confirmations: 0` rather than an error.

## POST /api/send

The generated wallet pays and signs. One call does everything: build, sign, submit,
append to the history.

```json
{ "message": "ola amigo", "ada": 5 }
```

```json
{ "txHash": "1c9ad16f..." }
```

## The browser-wallet flow

A CIP-30 wallet holds the keys, so signing happens in the browser and the transaction is
split across three calls.

```
/api/address   hex address from the wallet  ->  bech32 + balance
/api/build     message + amount + address   ->  unsigned transaction
/api/submit    transaction + witness set    ->  transaction hash
```

### POST /api/address

CIP-30 returns addresses as `cbor<address>` hex. Some wallets send the raw address bytes,
some wrap them in a CBOR byte string; accept both. `address` (bech32) is accepted instead
of `addressHex` when the caller only wants a fresh balance.

```json
{ "addressHex": "00b81d9d..." }
```

```json
{ "address": "addr_test1...", "balance": "5000000000" }
```

Reject an address whose network id is not `0` with a message telling the user to switch
the wallet to preprod. Read the id from the decoded address, not from what the wallet
claims: `getNetworkId()` only separates testnet from mainnet and cannot tell preprod from
preview.

### POST /api/build

Builds an unsigned transaction paid for by `address`. Building needs no private key, so
this is the same code path as `/api/send` with a different sender.

```json
{ "message": "ola amigo", "ada": 5, "address": "addr_test1..." }
```

```json
{ "txCbor": "84a400d90102...", "txHash": "1c9ad16f...", "fee": "176017" }
```

The service remembers what each built transaction is about, keyed by its CBOR. The
history entry is written on submit from that record, not from the submit request, so a
client cannot write arbitrary entries into the timeline.

Apply the same message and amount validation as `/api/send`. A browser wallet must not be
able to slip past the limits.

### POST /api/submit

```json
{ "txCbor": "84a400d90102...", "witnessSet": "a100d9010281..." }
```

```json
{ "txHash": "1c9ad16f..." }
```

`witnessSet` is what `signTx` returned: **only the witness set, not a finished
transaction**. The service attaches it and submits the result.

Assembling matters more than it looks. A transaction is the CBOR array
`[body, witnessSet, isValid, auxiliaryData]`, and the signature covers the exact bytes of
the body. Decoding the transaction and re-encoding it can change those bytes (definite vs
indefinite lengths, map key order, tags) and the node then rejects a transaction that
looks correct. Locate the second element and replace its bytes; leave the rest untouched.

The transaction we build is unsigned, so its witness set is empty and replacing it
outright is correct.

## Errors

| Status | When |
|---|---|
| 400 | invalid JSON, missing field, message too long, amount below 1 ADA, address not on preprod |
| 404 | unknown path |
| 409 | previous transaction has not reached a block yet |
| 500 | anything else |

The node reports a rejected submission as a wall of JSON. Translate at least these:

| Node says | Tell the user |
|---|---|
| `All inputs are spent`, `BadInputsUTxO` | the previous transaction is not in a block yet, wait for one confirmation |
| `ValueNotConservedUTxO`, `CCL Error -8` | not enough funds for this amount plus the fee |
| `OutputTooSmallUTxO` | amount is below the minimum an output may hold |

The first one is not an edge case. Koios only reports UTXOs that are already on-chain, so
sending twice within about 20 seconds hits it every time.

## Transaction shape

Every service builds the same transaction from a TxPlan YAML document:

```yaml
version: 1.0
transaction:
  - tx:
      from: <sender>
      intents:
        - type: payment
          address: <receiver>
          amounts:
            - unit: lovelace
              quantity: "5000000"
        - type: metadata
          metadata: '{"674": {"msg": "<message>"}}'
```

Label `674` is the CIP-20 message standard, which is why wallets and explorers show the
text.

The metadata value is JSON inside a single-quoted YAML scalar, so both layers need
escaping. A message containing an apostrophe closes the scalar and breaks the document.
Escape it (`''`) or build the YAML with a real emitter.
