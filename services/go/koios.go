package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

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

func (p KoiosProvider) Balance(address string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"_addresses": []string{address},
	})

	resp, err := http.Post(
		"https://preprod.koios.rest/api/v1/address_info",
		"application/json",
		bytes.NewReader(body),
	)

	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var raw []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return "", err
	}
	if len(raw) == 0 {
		return "0", nil
	}

	balance, ok := raw[0]["balance"].(string)
	if !ok {
		return "0", nil
	}

	return balance, nil
}

func (p KoiosProvider) Submit(txCborHex string) (string, error) {
	raw, err := hex.DecodeString(txCborHex)
	if err != nil {
		return "", err
	}

	resp, err := http.Post(
		"https://preprod.koios.rest/api/v1/submittx",
		"application/cbor",
		bytes.NewReader(raw),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("koios rejected the transaction: %s", string(body))
	}

	return strings.Trim(strings.TrimSpace(string(body)), "\""), nil
}
