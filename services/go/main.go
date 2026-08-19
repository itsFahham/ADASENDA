package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/bloxbean/cardano-client-bindings/wrappers/go/ccl"
)

func main() {
	bridge, err := ccl.New()
	if err != nil {
		panic(err)
	}
	defer bridge.Close()

	data, err := os.ReadFile("../../wallets/sender.json")
	if err != nil {
		panic(err)
	}

	var sender Wallet
	if err := json.Unmarshal(data, &sender); err != nil {
		panic(err)
	}

	fmt.Println(sender.BaseAddress)

	receiverData, err := os.ReadFile("../../wallets/receiver.json")
	if err != nil {
		panic(err)
	}

	var receiver Wallet
	if err := json.Unmarshal(receiverData, &receiver); err != nil {
		panic(err)
	}

	yaml := fmt.Sprintf(`
version: 1.0
transaction:
  - tx:
      from: %s
      intents:
        - type: payment
          address: %s
          amounts:
            - unit: lovelace
              quantity: "5000000"
        - type: metadata
          metadata: '{"674": {"msg": "hallo aus go"}}'
`, sender.BaseAddress, receiver.BaseAddress)

	result, err := bridge.QuickTx.BuildWith(yaml, KoiosProvider{}, sender.BaseAddress)
	if err != nil {
		panic(err)
	}

	fmt.Println("tx hash:", result.TxHash)
	fmt.Println("fee    :", result.Fee)

	signed, err := bridge.Account.SignTx(sender.Mnemonic, ccl.Preprod, 0, 0, result.TxCbor)
	if err != nil {
		panic(err)
	}

	raw, err := hex.DecodeString(signed)
	if err != nil {
		panic(err)
	}

	resp, err := http.Post(
		"https://preprod.koios.rest/api/v1/submittx",
		"application/cbor",
		bytes.NewReader(raw),
	)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println("submitted:", strings.Trim(strings.TrimSpace(string(body)), `"`))
}
