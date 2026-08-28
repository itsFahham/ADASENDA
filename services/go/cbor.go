package main

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"strings"
)

type cborHead struct {
	major  int
	info   int
	length int
	next   int
}

func readCborHead(data []byte, offset int) (cborHead, error) {
	if offset >= len(data) {
		return cborHead{}, fmt.Errorf("cbor ends inside a head at %d", offset)
	}

	initial := data[offset]
	head := cborHead{
		major: int(initial >> 5),
		info:  int(initial & 0x1f),
	}

	switch {
	case head.info < 24:
		head.length = head.info
		head.next = offset + 1

	case head.info == 24:
		if offset+2 > len(data) {
			return cborHead{}, fmt.Errorf("cbor ends inside a head at %d", offset)
		}
		head.length = int(data[offset+1])
		head.next = offset + 2

	case head.info == 25:
		if offset+3 > len(data) {
			return cborHead{}, fmt.Errorf("cbor ends inside a head at %d", offset)
		}
		head.length = int(binary.BigEndian.Uint16(data[offset+1:]))
		head.next = offset + 3

	case head.info == 26:
		if offset+5 > len(data) {
			return cborHead{}, fmt.Errorf("cbor ends inside a head at %d", offset)
		}
		head.length = int(binary.BigEndian.Uint32(data[offset+1:]))
		head.next = offset + 5

	case head.info == 27:
		if offset+9 > len(data) {
			return cborHead{}, fmt.Errorf("cbor ends inside a head at %d", offset)
		}
		length := binary.BigEndian.Uint64(data[offset+1:])
		if length > 1<<62 {
			return cborHead{}, fmt.Errorf("cbor argument at %d is too large", offset)
		}
		head.length = int(length)
		head.next = offset + 9

	case head.info == 31:
		head.length = 0
		head.next = offset + 1

	default:
		return cborHead{}, fmt.Errorf("reserved cbor additional info %d at %d", head.info, offset)
	}

	return head, nil
}

func skipCborItem(data []byte, offset int) (int, error) {
	head, err := readCborHead(data, offset)
	if err != nil {
		return 0, err
	}

	indefinite := head.info == 31

	switch head.major {
	case 0, 1: // unsigned and negative integers
		return head.next, nil

	case 2, 3:
		if indefinite {
			return skipUntilBreak(data, head.next)
		}
		end := head.next + head.length
		if end > len(data) {
			return 0, fmt.Errorf("cbor string at %d runs past the end", offset)
		}
		return end, nil

	case 4:
		if indefinite {
			return skipUntilBreak(data, head.next)
		}
		return skipCborItems(data, head.next, head.length)

	case 5:
		if indefinite {
			return skipUntilBreak(data, head.next)
		}
		return skipCborItems(data, head.next, head.length*2)

	case 6:
		return skipCborItem(data, head.next)

	case 7:
		if indefinite {
			return 0, fmt.Errorf("unexpected break at %d", offset)
		}
		return head.next, nil
	}

	return 0, fmt.Errorf("unknown cbor major type %d at %d", head.major, offset)
}

func skipCborItems(data []byte, offset int, count int) (int, error) {
	cursor := offset

	for i := 0; i < count; i++ {
		next, err := skipCborItem(data, cursor)
		if err != nil {
			return 0, err
		}
		cursor = next
	}

	return cursor, nil
}

func skipUntilBreak(data []byte, offset int) (int, error) {
	cursor := offset

	for {
		if cursor >= len(data) {
			return 0, fmt.Errorf("cbor ends before its break")
		}

		if data[cursor] == 0xff {
			return cursor + 1, nil
		}

		next, err := skipCborItem(data, cursor)
		if err != nil {
			return 0, err
		}
		cursor = next
	}
}

func attachWitnessSet(txCborHex string, witnessSetCborHex string) (string, error) {
	tx, err := hex.DecodeString(strings.TrimSpace(txCborHex))
	if err != nil {
		return "", fmt.Errorf("transaction is not valid hex: %w", err)
	}

	witnessSet, err := hex.DecodeString(strings.TrimSpace(witnessSetCborHex))
	if err != nil {
		return "", fmt.Errorf("witness set is not valid hex: %w", err)
	}

	outer, err := readCborHead(tx, 0)
	if err != nil {
		return "", err
	}
	if outer.major != 4 {
		return "", fmt.Errorf("transaction cbor is not an array")
	}

	bodyEnd, err := skipCborItem(tx, outer.next)
	if err != nil {
		return "", err
	}

	witnessEnd, err := skipCborItem(tx, bodyEnd)
	if err != nil {
		return "", err
	}

	assembled := make([]byte, 0, bodyEnd+len(witnessSet)+len(tx)-witnessEnd)
	assembled = append(assembled, tx[:bodyEnd]...)
	assembled = append(assembled, witnessSet...)
	assembled = append(assembled, tx[witnessEnd:]...)

	return hex.EncodeToString(assembled), nil
}

func unwrapAddressHex(addressHex string) string {
	clean := strings.TrimSpace(addressHex)

	data, err := hex.DecodeString(clean)
	if err != nil {
		return clean
	}

	head, err := readCborHead(data, 0)
	if err != nil {
		return clean
	}

	if head.major == 2 && head.next+head.length == len(data) {
		return hex.EncodeToString(data[head.next:])
	}

	return clean
}
