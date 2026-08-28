package main

import (
	"fmt"
	"testing"

	"github.com/bloxbean/cardano-client-bindings/wrappers/go/ccl"
)

func TestAttachWitnessSetRoundTrip(t *testing.T) {
	bridge, err := ccl.New()
	if err != nil {
		t.Fatal(err)
	}
	defer bridge.Close()

	sender, err := loadWallet("../../wallets/sender.json")
	if err != nil {
		t.Fatal(err)
	}
	receiver, err := loadWallet("../../wallets/receiver.json")
	if err != nil {
		t.Fatal(err)
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
          metadata: '{"674": {"msg": "roundtrip test"}}'
`, sender.BaseAddress, receiver.BaseAddress)

	result, err := bridge.QuickTx.BuildWith(yaml, KoiosProvider{}, sender.BaseAddress)
	if err != nil {
		t.Fatal(err)
	}

	signed, err := bridge.Account.SignTx(sender.Mnemonic, ccl.Preprod, 0, 0, result.TxCbor)
	if err != nil {
		t.Fatal(err)
	}

	prefix := 0
	for prefix < len(result.TxCbor) && result.TxCbor[prefix] == signed[prefix] {
		prefix++
	}
	suffix := 0
	for suffix < len(result.TxCbor) &&
		result.TxCbor[len(result.TxCbor)-1-suffix] == signed[len(signed)-1-suffix] {
		suffix++
	}

	witnessSet := signed[prefix-(prefix%2) : len(signed)-suffix+(suffix%2)]

	attached, err := attachWitnessSet(result.TxCbor, witnessSet)
	if err != nil {
		t.Fatal(err)
	}
	if attached != signed {
		t.Fatalf("attach did not reproduce the signed transaction")
	}

	stripped, err := attachWitnessSet(signed, "a0")
	if err != nil {
		t.Fatal(err)
	}
	if stripped != result.TxCbor {
		t.Fatalf("stripping did not reproduce the unsigned transaction")
	}

	t.Logf("unsigned %d bytes, signed %d bytes, witness set starts with %s",
		len(result.TxCbor)/2, len(signed)/2, witnessSet[:12])
}
