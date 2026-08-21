package main

import (
	"encoding/json"
	"os"
)

type HistoryEntry struct {
	TxHash   string `json:"txHash"`
	Message  string `json:"message"`
	Lovelace string `json:"lovelace"`
	To       string `json:"to"`
	SentAt   string `json:"sentAt"`
}

func readHistory() ([]HistoryEntry, error) {
	data, err := os.ReadFile("../../data/history.json")
	if os.IsNotExist(err) {
		return []HistoryEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	var history []HistoryEntry
	if err := json.Unmarshal(data, &history); err != nil {
		return nil, err
	}
	return history, nil
}

func addToHistory(entry HistoryEntry) error {
	history, err := readHistory()
	if err != nil {
		return err
	}
	history = append([]HistoryEntry{entry}, history...)
	data, err := json.MarshalIndent(history, "", "  ")
	return os.WriteFile("../../data/history.json", data, 0644)

}
