<p align="center">
  <img src="assets/rust-go-javascript.png" alt="Rust, Go and JavaScript meeting Cardano" width="420">
</p>

<h1 align="center">ADASENDA</h1>

<p align="center">
  Send ADA with a message attached, written into the transaction itself and stored on-chain forever.<br>
  The same postcard, sent from <b>JavaScript</b>, <b>Rust</b> and <b>Go</b>, through the same native Cardano library.
</p>

---

## What this is

A message on Cardano is not a comment field. It is transaction metadata under label `674`
([CIP-20](https://cips.cardano.org/cip/CIP-20)), and once a block picks it up, it stays there.
Wallets and explorers know that label, so the text shows up wherever the transaction does.

This project sends that transaction three times over, once per language, against the same
`libccl` native library through the [Cardano Client Bindings](https://github.com/bloxbean/cardano-client-bindings).
One frontend, three interchangeable backends, one shared API contract.

> Everything here runs on the **Preprod testnet**. The ADA is free, worthless, and comes from a faucet.
> The permanence is not: whatever you send is public forever, testnet or not.

## Layout

```
frontend/          React + Vite dashboard, wallet connector
services/js/       Bun HTTP service  :3001   full API, both signing modes
services/rust/     command line              builds, signs and submits one postcard
services/go/       command line              same, in Go
examples/          the same transaction as a single readable file per language
docs/api.md        the contract every service implements
wallets/           generated test wallets  (git-ignored, holds mnemonics)
data/              shared postcard history (git-ignored)
```

## Who signs

Two ways to pay, switchable in the UI:

| Mode | Keys live | Signed by |
|---|---|---|
| **Generated wallet** | in `wallets/sender.json` on disk | the service |
| **Browser wallet** | in your extension | you, via [CIP-30](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030) |

The browser-wallet path is the interesting one. The wallet hands back **only a witness set**,
not a finished transaction, and the library has no function to attach it. So the service does it
on the CBOR level: locate the second element of `[body, witnessSet, isValid, auxiliaryData]` and
replace its bytes. Never decode and re-encode the body. The signature covers those exact bytes, and
no encoder promises to reproduce them.


## Run it

Everything needs a funded sender wallet. The first start generates one and prints its address, then
top it up at the [Preprod faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) — one
request per IP per day, so plan accordingly. All three languages read the same `wallets/` folder, so
you fund it once.

### The app

The service and the frontend, two terminals. This is the part with the dashboard and the browser
wallet. Needs [Bun](https://bun.sh/).

```bash
cd services/js && bun install && bun run server.ts
```

```bash
cd frontend && bun install && bun dev
```

Then open `http://localhost:5173`.

### The other two languages

Rust and Go send one postcard from the command line and exit. Same library, same transaction, no
HTTP service yet.

```bash
cd services/rust && cargo run
```

Needs the Rust toolchain and, on Windows, the MSVC build tools.

```bash
cd services/go && go mod tidy && go run .
```

Needs Go 1.21+.

Every run submits a real transaction to preprod. Wait about 20 seconds between two runs: Koios only
reports UTXOs that are already on-chain, so a second send would reuse inputs that are already gone.

## The transaction

All three languages build the same thing, a TxPlan YAML document handed to the native library:

```yaml
version: 1.0
transaction:
  - tx:
      from: addr_test1...
      intents:
        - type: payment
          address: addr_test1...
          amounts:
            - unit: lovelace
              quantity: "5000000"
        - type: metadata
          metadata: '{"674": {"msg": "she call mi mr boombastic"}}'
```

UTXO selection, the fee and the change output happen inside `libccl`, fully offline. Chain data comes
from [Koios](https://koios.rest/), which needs no API key. The library never submits anything itself.

## Documentation

- [Cardano Client Bindings](https://github.com/bloxbean/cardano-client-bindings) — the wrappers used here
- [TxPlan and the intent catalog](https://github.com/bloxbean/cardano-client-bindings/blob/main/docs/quicktx.md) — every intent beyond `payment` and `metadata`
- [Cardano Client Lib](https://github.com/bloxbean/cardano-client-lib) — the Java library underneath
- [CIP-30](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030) — the dApp/wallet bridge
- [CIP-20](https://cips.cardano.org/cip/CIP-20) — transaction message metadata
- [docs/api.md](docs/api.md) — the contract shared by all three services

## Notes from building this

- **A metadata string is capped at 64 bytes**, not 64 characters. Emoji and umlauts cost more than one.
- **You cannot send twice in a row.** Koios only reports UTXOs that are already on-chain, so a second
  send within ~20 seconds spends inputs that are already gone and the node answers `All inputs are spent`.
- **The metadata is JSON inside a single-quoted YAML scalar.** An apostrophe in the message closes the
  scalar and breaks the document. Escape it.
- **The Go wrapper has no usable tag yet.** `go get .../wrappers/go` resolves to a parent-repo tag that
  does not contain it. Use `@main`.
- **`build_with` is not everywhere.** Go and JS have it, Rust does not — there you fetch the chain data
  yourself and pass it to `build`.
- **`getNetworkId()` cannot tell preprod from preview.** Both are network id 0. Decode the address instead.


