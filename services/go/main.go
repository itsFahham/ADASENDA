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

type Wallet struct {
	BaseAddress string `json:"base_address"`
	Mnemonic    string `json:"mnemonic"`
}

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

type KoiosProvider struct{}

func (p KoiosProvider) Utxos(address string) ([]map[string]interface{}, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"_addresses": []string{address},
	})

	resp, err := http.Post(
		"https://preprod.koios.rest/api/v1/address_utxos",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	utxos := make([]map[string]interface{}, 0, len(raw))
	for _, u := range raw {
		utxos = append(utxos, map[string]interface{}{
			"tx_hash":               u["tx_hash"],
			"output_index":          u["tx_index"],
			"address":               u["address"],
			"amount":                []map[string]interface{}{{"unit": "lovelace", "quantity": u["value"]}},
			"data_hash":             u["datum_hash"],
			"reference_script_hash": u["reference_script"],
		})
	}

	return utxos, nil
}

func (p KoiosProvider) ProtocolParams() (map[string]interface{}, error) {
	resp, err := http.Get("https://preprod.koios.rest/api/v1/epoch_params")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	if len(raw) == 0 {
		return nil, fmt.Errorf("koios returned no protocol parameters")
	}

	params := raw[0]
	params["cost_models_raw"] = params["cost_models"]
	delete(params, "cost_models")

	return params, nil
}
