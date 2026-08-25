package main

import (
	"fmt"
	"net/http"

	"github.com/bloxbean/cardano-client-bindings/wrappers/go/ccl"
)

func main() {
	bridge, err := ccl.New()
	if err != nil {
		panic(err)
	}
	defer bridge.Close()

	sender, err := loadWallet("../../wallets/sender.json")
	if err != nil {
		panic(err)
	}

	fmt.Println(sender.BaseAddress)

	receiver, err := loadWallet("../../wallets/receiver.json")
	if err != nil {
		panic(err)
	}

	app := &App{
		bridge:   bridge,
		sender:   sender,
		receiver: receiver,
	}

	http.HandleFunc("/api/info", app.handleInfo)
	http.HandleFunc("/api/history", app.handleHistory)

	if err := http.ListenAndServe(":3003", nil); err != nil {
		panic(err)
	}
}
