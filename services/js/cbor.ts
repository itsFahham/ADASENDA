

interface Head {
    major: number;
    info: number;
    length: number;
    next: number;
}

function readHead(bytes: Uint8Array, offset: number): Head {
    const initial = bytes[offset];
    if (initial === undefined) throw new Error(`CBOR ends inside a head at ${offset}`);

    const major = initial >> 5;
    const info = initial & 0x1f;

    if (info < 24) return { major, info, length: info, next: offset + 1 };

    if (info === 24) return { major, info, length: bytes[offset + 1]!, next: offset + 2 };

    if (info === 25) {
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        return { major, info, length: view.getUint16(offset + 1), next: offset + 3 };
    }

    if (info === 26) {
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        return { major, info, length: view.getUint32(offset + 1), next: offset + 5 };
    }

    if (info === 27) {
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        const length = view.getBigUint64(offset + 1);
        if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR item too large");
        return { major, info, length: Number(length), next: offset + 9 };
    }

    if (info === 31) return { major, info, length: 0, next: offset + 1 };

    throw new Error(`Reserved CBOR additional info ${info} at ${offset}`);
}

/** Offset of the first byte after the item starting at `offset`. */
function skipItem(bytes: Uint8Array, offset: number): number {
    const head = readHead(bytes, offset);
    const indefinite = head.info === 31;

    switch (head.major) {
        case 0: // unsigned
        case 1: // negative
            return head.next;

        case 2: // byte string
        case 3: // text string
            if (!indefinite) return head.next + head.length;
            return skipUntilBreak(bytes, head.next);

        case 4: // array
            if (indefinite) return skipUntilBreak(bytes, head.next);
            return skipItems(bytes, head.next, head.length);

        case 5: // map
            if (indefinite) return skipUntilBreak(bytes, head.next);
            return skipItems(bytes, head.next, head.length * 2);

        case 6: // tag, followed by the tagged item
            return skipItem(bytes, head.next);

        case 7: // simple values and floats, fully described by the head
            if (indefinite) throw new Error(`Unexpected break at ${offset}`);
            return head.next;

        default:
            throw new Error(`Unknown CBOR major type ${head.major} at ${offset}`);
    }
}

function skipItems(bytes: Uint8Array, offset: number, count: number): number {
    let cursor = offset;
    for (let i = 0; i < count; i++) cursor = skipItem(bytes, cursor);
    return cursor;
}

function skipUntilBreak(bytes: Uint8Array, offset: number): number {
    let cursor = offset;
    while (bytes[cursor] !== 0xff) {
        if (cursor >= bytes.length) throw new Error("CBOR ends before its break");
        cursor = skipItem(bytes, cursor);
    }
    return cursor + 1;
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim();
    if (clean.length % 2 !== 0) throw new Error("Hex string has an odd length");

    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) throw new Error("Hex string contains a non-hex character");
        bytes[i] = byte;
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = "";
    for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
    return hex;
}


export function attachWitnessSet(txCborHex: string, witnessSetCborHex: string): string {
    const tx = hexToBytes(txCborHex);

    const outer = readHead(tx, 0);
    if (outer.major !== 4) throw new Error("Transaction CBOR is not an array");

    const bodyEnd = skipItem(tx, outer.next);
    const witnessEnd = skipItem(tx, bodyEnd);

    const head = tx.subarray(0, bodyEnd);
    const witnessSet = hexToBytes(witnessSetCborHex);
    const tail = tx.subarray(witnessEnd);

    const assembled = new Uint8Array(head.length + witnessSet.length + tail.length);
    assembled.set(head, 0);
    assembled.set(witnessSet, head.length);
    assembled.set(tail, head.length + witnessSet.length);

    return bytesToHex(assembled);
}


export function unwrapAddressHex(hex: string): string {
    const bytes = hexToBytes(hex);
    const head = readHead(bytes, 0);

    if (head.major === 2 && head.next + head.length === bytes.length) {
        return bytesToHex(bytes.subarray(head.next));
    }

    return hex.trim();
}
