export function bytesToShort(bytes) {
  return (bytes[0] & 0xff) | ((bytes[1] & 0xff) << 8);
}

export function shortToBytes(short) {
  return new Uint8Array([short & 0xff, (short >> 8) & 0xff]);
}

export function bytesToInt(bytes) {
  return (
    (bytes[0] & 0xff) |
    ((bytes[1] & 0xff) << 8) |
    ((bytes[2] & 0xff) << 16) |
    ((bytes[3] & 0xff) << 24)
  );
}

export function intToBytes(int) {
  return new Uint8Array([
    int & 0xff,
    (int >> 8) & 0xff,
    (int >> 16) & 0xff,
    (int >> 24) & 0xff,
  ]);
}

export function longToBytes(long) {
  return new Uint8Array([
    Number(long & 0xffn),
    Number((long >> 8n) & 0xffn),
    Number((long >> 16n) & 0xffn),
    Number((long >> 24n) & 0xffn),
    Number((long >> 32n) & 0xffn),
    Number((long >> 40n) & 0xffn),
    Number((long >> 48n) & 0xffn),
    Number((long >> 56n) & 0xffn),
  ]);
}
