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

	http.HandleFunc("/api/info", withCORS(app.handleInfo))
	http.HandleFunc("/api/history", withCORS(app.handleHistory))
	http.HandleFunc("/api/send", withCORS(app.handleSend))
	http.HandleFunc("/api/address", withCORS(app.handleAddress))
	http.HandleFunc("/api/build", withCORS(app.handleBuild))
	http.HandleFunc("/api/submit", withCORS(app.handleSubmit))

	if err := http.ListenAndServe(":3003", nil); err != nil {
		panic(err)
	}
}
