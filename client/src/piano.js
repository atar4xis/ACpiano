import {
  NUM_WHITE_KEYS,
  NOTES,
  BLACK_KEY_WIDTH_RATIO,
  BLACK_KEY_HEIGHT_RATIO,
  BASE_KEY_BINDINGS,
} from "./constants.js";
import { loadSound } from "./audio.js";
import { baseOctave } from "./input.js";

export const keys = [];
export let sustain = false;
let keynames = false;

// we'll avoid redrawing the keys every frame by caching them in offscreen canvases
let prerenderedKeys = null;
let prerenderCanvases = {
  white: document.createElement("canvas"),
  black: document.createElement("canvas"),
};

// keep track of whether all keys have loaded their sounds
let allKeysLoaded = false;

let whiteKeyWidth = 0;
let blackKeyWidth = 0;
let blackKeyHeight = 0;

export function addPianoKey(uid, note, octave) {
  const key = {
    note: note + octave,
    baseNote: note,
    octave,
    sharp: note.includes("s"),
    index: NOTES.indexOf(note),
    blips: [], // a "blip" is a visual indicator of a key press
    playings: [], // stores audio playback instances for this key
    sound: null,
    uid: uid,
  };
  keys.push(key);
  loadSound(note + octave).then((buf) => (key.sound = buf));
}

export function setSustain(bool) {
  sustain = bool;
}

export function setKeyNames(bool) {
  keynames = bool;
  prerenderedKeys = null; // redraw keys when toggling labels
}

export function addPianoKeys() {
  const allKeys = [
    ["a", -1],
    ["as", -1],
    ["b", -1],
    ...Array.from({ length: 7 }, (_, o) => NOTES.map((n) => [n, o])).flat(),
    ["c", 7],
  ];
  for (const [i, [n, o]] of allKeys.entries()) {
    addPianoKey(i, n, o);
  }
}

export function createPianoCanvas() {
  const canvas = document.createElement("canvas");
  const $piano = document.getElementById("piano");
  $piano.appendChild(canvas);

  const adjustSize = () => {
    $piano.style.height = $piano.offsetWidth * 0.2 + "px";

    canvas.width = $piano.offsetWidth;
    canvas.height = $piano.offsetHeight;

    whiteKeyWidth = canvas.width / NUM_WHITE_KEYS;
    blackKeyWidth = whiteKeyWidth * BLACK_KEY_WIDTH_RATIO;
    blackKeyHeight = canvas.height * BLACK_KEY_HEIGHT_RATIO;

    prerenderedKeys = null; // invalidate prerendered keys, this will force a redraw
  };

  window.addEventListener("resize", adjustSize);
  adjustSize();

  return canvas;
}

// converts KeyboardEvent.code strings to readable characters to show user-friendly labels
function codeToChar(code) {
  if (code.startsWith("Key")) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  const symbolMap = {
    Equal: "=",
    Minus: "-",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Space: " ",
  };

  return symbolMap[code] || "";
}

export function prerenderPiano(piano) {
  let cnvWhite = prerenderCanvases.white;
  let cnvBlack = prerenderCanvases.black;

  cnvWhite.width = piano.width;
  cnvWhite.height = piano.height;
  cnvBlack.width = piano.width;
  cnvBlack.height = piano.height;

  // draw white keys
  let ctx = cnvWhite.getContext("2d");
  let whiteIndex = 0;

  for (const key of keys) {
    if (key.sharp) continue;

    const x = whiteIndex * whiteKeyWidth;

    if (!key.sound) {
      ctx.globalAlpha = 0.15;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, piano.height);
    gradient.addColorStop(0, "#fdfdfd");
    gradient.addColorStop(1, "#cccccc");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, whiteKeyWidth, piano.height);

    ctx.strokeStyle = "#444";
    ctx.strokeRect(x, 0, whiteKeyWidth, piano.height);

    if (keynames) {
      ctx.fillStyle = "#aaa";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontSize = whiteKeyWidth / 1.85;
      ctx.font = fontSize + "px sans-serif";
      const binding = BASE_KEY_BINDINGS.filter(
        ([, note, offset]) =>
          note === key.baseNote && baseOctave + offset === key.octave,
      );
      const centerX = x + whiteKeyWidth / 2;
      const noteY = piano.height - fontSize * 0.85;
      const keyY = piano.height - fontSize * 2.25;
      ctx.fillText(key.baseNote, centerX, noteY);
      ctx.fillStyle = "#777";
      if (binding && binding.length > 0) {
        for (let i = 0; i < binding.length; i++) {
          let mapping = codeToChar(binding[i][0]);
          ctx.fillText(mapping, centerX, keyY - i * fontSize * 1.25);
        }
      }
    }

    key.x = x;
    key.width = whiteKeyWidth;

    whiteIndex++;
  }

  // store the prerendered keys
  prerenderedKeys = {};
  prerenderedKeys.white = cnvWhite;

  // draw black keys
  ctx = cnvBlack.getContext("2d");
  whiteIndex = 0;

  for (const key of keys) {
    if (!key.sharp) {
      whiteIndex++;
      continue;
    }

    // calculate x for black keys relative to white keys
    const prevWhiteIndex = whiteIndex - 1;
    const x = (prevWhiteIndex + 1) * whiteKeyWidth - blackKeyWidth / 2;

    if (!key.sound) {
      ctx.globalAlpha = 0.15;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, blackKeyHeight);
    gradient.addColorStop(0, "#333");
    gradient.addColorStop(1, "#111");

    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);

    if (keynames) {
      ctx.fillStyle = "#777";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fontSize = blackKeyWidth / 1.5;
      const binding = BASE_KEY_BINDINGS.filter(
        ([, note, offset]) =>
          note === key.baseNote && baseOctave + offset === key.octave,
      );
      const centerX = x + blackKeyWidth / 2;
      const noteY = blackKeyHeight - fontSize * 0.85;
      const keyY = blackKeyHeight - fontSize * 2.25;

      ctx.font = fontSize - 3 + "px sans-serif";
      ctx.fillText(key.baseNote.replace("s", "#"), centerX, noteY);
      ctx.fillStyle = "#eee";
      ctx.font = fontSize + "px sans-serif";
      if (binding && binding.length > 0) {
        for (let i = 0; i < binding.length; i++) {
          let mapping = codeToChar(binding[i][0]);
          ctx.fillText(mapping, centerX, keyY - i * fontSize * 1.5);
        }
      }
    }

    key.x = x;
    key.width = blackKeyWidth;
  }

  prerenderedKeys.black = cnvBlack;
}

export function drawPiano(piano, ctx) {
  if (!prerenderedKeys || !allKeysLoaded) {
    prerenderPiano(piano);

    // check if all keys have been loaded
    allKeysLoaded = keys.every((key) => key.sound !== null);
  }

  ctx.clearRect(0, 0, piano.width, piano.height);

  // loading text
  if (!allKeysLoaded) {
    ctx.fillStyle = "#cecece";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("loading sounds...", piano.width / 2, piano.height / 2);
  }

  try {
    ctx.drawImage(prerenderedKeys.white, 0, 0);
    drawBlips(keys, ctx, piano, false);

    ctx.drawImage(prerenderedKeys.black, 0, 0);
    drawBlips(keys, ctx, piano, true);
  } catch {}
}

function drawBlips(keys, ctx, piano, isSharp) {
  const now = Date.now();
  const fadeDuration = 1000; // ms duration for fade-out effect
  const blipMargin = 4;

  for (const key of keys) {
    if (key.sharp !== isSharp) continue;

    let blipHeight = isSharp ? blackKeyWidth / 1.5 : whiteKeyWidth / 1.5;
    const yBase = isSharp
      ? piano.height * BLACK_KEY_HEIGHT_RATIO
      : piano.height;

    key.blips = key.blips.filter((b) => now - b.time <= fadeDuration);

    for (let i = 0; i < key.blips.length; i++) {
      const blip = key.blips[i];
      const age = now - blip.time;
      const alpha = 1 - age / fadeDuration;
      const y = yBase - (i + 1) * (blipHeight + blipMargin / 2);

      ctx.fillStyle = blip.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(
        key.x + blipMargin / 2,
        y,
        key.width - blipMargin,
        blipHeight,
      );
    }
  }

  ctx.globalAlpha = 1;
}

// expose some variables for external use
if (!window.ACpiano) window.ACpiano = {};
window.ACpiano.keys = keys;
