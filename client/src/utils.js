import { HOMOGLYPH_MAP } from "./constants.js";

export const truncateTextWidth = (() => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  return function (text, maxWidth, font = "16px sans-serif") {
    context.font = font;

    if (context.measureText(text).width <= maxWidth) return text;

    let truncated = "";
    for (let i = 0; i < text.length; i++) {
      const next = truncated + text[i];
      if (context.measureText(next + "…").width > maxWidth) break;
      truncated = next;
    }

    return truncated + "…";
  };
})();

export function normalizeHomoglyphs(text) {
  for (const [key, value] of Object.entries(HOMOGLYPH_MAP)) {
    text = text.replace(new RegExp(key, "g"), value);
  }
  return text;
}

export function leetPattern(text) {
  const chars = text.split("");
  const result = [];
  let i = 0;

  while (i < chars.length) {
    // preserve escape sequences
    if (chars[i] === "\\" && i + 1 < chars.length) {
      result.push("\\" + chars[i + 1]);
      i += 2;
      continue;
    }

    const char = chars[i].toLowerCase();
    let charClass;

    switch (char) {
      case "a":
        charClass = "[4a@]";
        break;
      case "b":
        charClass = "[8b]";
        break;
      case "e":
        charClass = "[3e]";
        break;
      case "g":
        charClass = "[9g6]";
        break;
      case "i":
        charClass = "[1li!]";
        break;
      case "o":
        charClass = "[0o]";
        break;
      case "s":
        charClass = "[5s$]";
        break;
      case "t":
        charClass = "[7t+]";
        break;
      case "l":
        charClass = "[1l|]";
        break;
      case "z":
        charClass = "[2z]";
        break;
      case "c":
        charClass = "[c<]";
        break;
      case "x":
        charClass = "[x*]";
        break;
      case "q":
        charClass = "[q9]";
        break;
      case "y":
        charClass = "[y7]";
        break;
      case "u":
        charClass = "[uv]";
        break;
      default:
        charClass = char;
    }

    result.push(`(${charClass})+`);
    i++;
  }

  return result.join("[\\s\\W]*");
}

export function intToBytes(int) {
  return new Uint8Array([
    int & 0xff,
    (int >> 8) & 0xff,
    (int >> 16) & 0xff,
    (int >> 24) & 0xff,
  ]);
}

export function bytesToInt(bytes) {
  return (
    (bytes[0] & 0xff) |
    ((bytes[1] & 0xff) << 8) |
    ((bytes[2] & 0xff) << 16) |
    ((bytes[3] & 0xff) << 24)
  );
}

export function bytesToShort(bytes) {
  return (bytes[0] & 0xff) | ((bytes[1] & 0xff) << 8);
}

export function shortToBytes(short) {
  return new Uint8Array([short & 0xff, (short >> 8) & 0xff]);
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

export function bytesToLong(bytes) {
  return (
    (BigInt(bytes[0]) & 0xffn) |
    ((BigInt(bytes[1]) & 0xffn) << 8n) |
    ((BigInt(bytes[2]) & 0xffn) << 16n) |
    ((BigInt(bytes[3]) & 0xffn) << 24n) |
    ((BigInt(bytes[4]) & 0xffn) << 32n) |
    ((BigInt(bytes[5]) & 0xffn) << 40n) |
    ((BigInt(bytes[6]) & 0xffn) << 48n) |
    ((BigInt(bytes[7]) & 0xffn) << 56n)
  );
}

export function bytes(text) {
  return new TextEncoder().encode(text);
}
