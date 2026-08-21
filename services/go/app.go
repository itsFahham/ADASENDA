package main

import (
	"encoding/json"
	"net/http"

	"github.com/bloxbean/cardano-client-bindings/wrappers/go/ccl"
)

const maxMessageBytes = 64
const minLoveLace = 1_000_000

type App struct {
	bridge   *ccl.Bridge
	provider KoiosProvider
	sender   Wallet
	receiver Wallet
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{"error": message})
}

func (a *App) handleInfo(w http.ResponseWriter, r *http.Request) {
	balance, err := a.provider.Balance(a.sender.BaseAddress)

	var balanceValue interface{} = balance
	if err != nil {
		balanceValue = nil
	}

	writeJSON(w, 200, map[string]interface{}{
		"sender":          a.sender.BaseAddress,
		"receiver":        a.receiver.BaseAddress,
		"network":         "preprod",
		"balance":         balanceValue,
		"maxMessageBytes": maxMessageBytes,
	})
}
