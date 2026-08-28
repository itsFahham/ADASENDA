package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bloxbean/cardano-client-bindings/wrappers/go/ccl"
)

// Cardano rejects a metadata string above 64 bytes.
const maxMessageBytes = 64
const minLoveLace = 1_000_000

// Everything the handlers need. They are plain functions and see nothing of main.
type App struct {
	bridge   *ccl.Bridge
	provider KoiosProvider
	sender   Wallet
	receiver Wallet
}

type pendingBuild struct {
	message  string
	lovelace string
	to       string
}

// Transactions between build and submit. The lock is needed because every
// request runs in its own goroutine.
var (
	pendingMu     sync.Mutex
	pendingBuilds = map[string]pendingBuild{}
)

// Headers first, then status, then body. After writing, the head is out.
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{"error": message})
}

// A missing balance is not fatal. A string cannot be nil.
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

// Show the history even when Koios is down, just without counts.
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

// len counts bytes, not characters.
// Round first: the conversion truncates and floats are imprecise.
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

// The metadata is JSON inside a single-quoted YAML scalar.
func (a *App) handleSend(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		writeError(w, 400, "invalid JSON body")
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
		reason, status := readableSubmitError(err)
		writeError(w, status, reason)
		return
	}

	signed, err := a.bridge.Account.SignTx(a.sender.Mnemonic, ccl.Preprod, 0, 0, result.TxCbor)
	if err != nil {
		reason, status := readableSubmitError(err)
		writeError(w, status, reason)
		return
	}

	txHash, err := a.provider.Submit(signed)
	if err != nil {
		reason, status := readableSubmitError(err)
		writeError(w, status, reason)
		return
	}

	if err := addToHistory(HistoryEntry{
		TxHash:   txHash,
		Message:  message,
		Lovelace: lovelace,
		To:       a.receiver.BaseAddress,
		SentAt:   time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		log.Printf("could not write history: %v", err)
	}

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

func (a *App) handleAddress(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}
	address, _ := body["address"].(string)
	if address == "" {
		addressHex, ok := body["addressHex"].(string)
		if !ok || addressHex == "" {
			writeError(w, 400, "addressHex or address is required")
			return
		}

		decoded, err := a.bridge.Address.FromBytes(unwrapAddressHex(addressHex))
		if err != nil {
			writeError(w, 400, "that is not a Cardano address")
			return
		}
		address = decoded
	}

	if !a.bridge.Address.Validate(address) {
		writeError(w, 400, "that is not a Cardano address")
		return
	}

	info, err := a.bridge.Address.Info(address)
	if err != nil {
		writeError(w, 400, "that is not a Cardano address")
		return
	}

	if info.NetworkID != 0 {
		writeError(w, 400, "That wallet is on mainnet. Switch it to preprod.")
		return
	}

	balance, err := a.provider.Balance(address)

	var balanceValue interface{} = balance
	if err != nil {
		balanceValue = nil
	}
	writeJSON(w, 200, map[string]interface{}{
		"address": address,
		"balance": balanceValue,
	})
}

// Remember what this was about, so submit does not trust the client.
func (a *App) handleBuild(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}

	message, lovelace, err := validate(body)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	from, ok := body["address"].(string)
	if !ok || from == "" {
		writeError(w, 400, "address is required")
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
`, from, a.receiver.BaseAddress, lovelace, message)

	result, err := a.bridge.QuickTx.BuildWith(yaml, a.provider, from)
	if err != nil {
		reason, status := readableSubmitError(err)
		writeError(w, status, reason)
		return
	}

	pendingMu.Lock()
	pendingBuilds[result.TxCbor] = pendingBuild{
		message:  message,
		lovelace: lovelace,
		to:       a.receiver.BaseAddress,
	}
	pendingMu.Unlock()

	writeJSON(w, 200, map[string]interface{}{
		"txCbor": result.TxCbor,
		"txHash": result.TxHash,
		"fee":    result.Fee,
	})
}

// known is false for an unknown key, which would otherwise write an empty entry.
func (a *App) handleSubmit(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid JSON body")
		return
	}

	txCbor, okTx := body["txCbor"].(string)
	witnessSet, okWitness := body["witnessSet"].(string)
	if !okTx || !okWitness {
		writeError(w, 400, "txCbor and witnessSet are required")
		return
	}

	pendingMu.Lock()
	pending, known := pendingBuilds[txCbor]
	pendingMu.Unlock()

	if !known {
		writeError(w, 400, "unknown transaction, build it again")
		return
	}

	signed, err := attachWitnessSet(txCbor, witnessSet)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	txHash, err := a.provider.Submit(signed)
	if err != nil {
		reason, status := readableSubmitError(err)
		writeError(w, status, reason)
		return
	}

	pendingMu.Lock()
	delete(pendingBuilds, txCbor)
	pendingMu.Unlock()

	if err := addToHistory(HistoryEntry{
		TxHash:   txHash,
		Message:  pending.message,
		Lovelace: pending.lovelace,
		To:       pending.to,
		SentAt:   time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		log.Printf("could not write history: %v", err)
	}

	writeJSON(w, 200, map[string]interface{}{"txHash": txHash})

}

// some readable error messages :)

func readableSubmitError(err error) (string, int) {
	raw := err.Error()

	switch {
	case strings.Contains(raw, "All inputs are spent"), strings.Contains(raw, "BadInputsUTxO"):
		return "The previous transaction has not reached a block yet, so its funds are still locked. Wait for one confirmation and try again.", 409

	case strings.Contains(raw, "ValueNotConservedUTxO"), strings.Contains(raw, "CCL Error -8"):
		return "Not enough funds to cover this amount plus the fee.", 400

	case strings.Contains(raw, "OutputTooSmallUTxO"):
		return "Amount is below the minimum a Cardano output may hold.", 400
	}

	return raw, 500
}
