package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

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

func (a *App) handleHistory(w http.ResponseWriter, r *http.Request) {
	entries, err := readHistory()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	hashes := make([]string, 0, len(entries))
	for _, entry := range entries {
		hashes = append(hashes, entry.TxHash)
	}

	confirmations, err := a.provider.Confirmations(hashes)
	if err != nil {
		confirmations = map[string]int{}
	}

	out := make([]map[string]interface{}, 0, len(entries))
	for _, entry := range entries {
		out = append(out, map[string]interface{}{
			"txHash":        entry.TxHash,
			"message":       entry.Message,
			"lovelace":      entry.Lovelace,
			"to":            entry.To,
			"sentAt":        entry.SentAt,
			"confirmations": confirmations[entry.TxHash],
		})
	}

	writeJSON(w, 200, out)
}

func validate(body map[string]interface{}) (string, string, error) {
	message, ok := body["message"].(string)
	if !ok || message == "" {
		return "", "", fmt.Errorf("message is required")
	}

	if len(message) > maxMessageBytes {
		return "", "", fmt.Errorf("message is too too long. a shorter one pls")
	}

	amount, ok := body["ada"].(float64)
	if !ok {
		amount = 5
	}

	lovelace := int64(math.Round(amount * 1_000_000))
	if lovelace < minLoveLace {
		return "", "", fmt.Errorf("Your amount is too short. Put some more!! At least 1, but more is always better :)")
	}

	return message, strconv.FormatInt(lovelace, 10), nil
}

func (a *App) handleSend(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	message, lovelace, err := validate(body)
	if err != nil {
		writeError(w, 400, err.Error())
		return
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
              quantity: "%s"
        - type: metadata
          metadata: '{"674": {"msg": "%s"}}'
`, a.sender.BaseAddress, a.receiver.BaseAddress, lovelace, message)

	result, err := a.bridge.QuickTx.BuildWith(yaml, a.provider, a.sender.BaseAddress)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	signed, err := a.bridge.Account.SignTx(a.sender.Mnemonic, ccl.Preprod, 0, 0, result.TxCbor)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	txHash, err := a.provider.Submit(signed)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	addToHistory(HistoryEntry{
		TxHash:   txHash,
		Message:  message,
		Lovelace: lovelace,
		To:       a.receiver.BaseAddress,
		SentAt:   time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, 200, map[string]interface{}{"txHash": txHash})
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next(w, r)
	}
}
