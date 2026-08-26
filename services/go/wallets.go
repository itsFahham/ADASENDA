package main

import (
	"encoding/json"
	"os"
)

type Wallet struct {
	BaseAddress string `json:"base_address"`
	Mnemonic    string `json:"mnemonic"`
}

func loadWallet(path string) (Wallet, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Wallet{}, err
	}
	var w Wallet
	json.Unmarshal(data, &w)
	return w, nil
}
