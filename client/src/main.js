import { addPianoKeys, createPianoCanvas, drawPiano } from "./piano.js";
import { attachInputHandlers } from "./input.js";
import { connect } from "./socket.js";
import { init as audioInit } from "./audio.js";
import {
  $midiDevicesBtn,
  $piano,
  $volumeWrapper,
  $sustainWrapper,
  $keyNamesWrapper,
} from "./dom.js";

let noPiano = false;
let piano;
let ctx;

function render() {
  drawPiano(piano, ctx);
  requestAnimationFrame(render);
}

function init() {
  if (!noPiano) {
    piano = createPianoCanvas();
    ctx = piano.getContext("2d");

    addPianoKeys();
    render();
  }

  attachInputHandlers(piano);
  connect(import.meta.env.VITE_WEBSOCKET_URL);

  if (noPiano) {
    $volumeWrapper.remove();
    $midiDevicesBtn.remove();
    $sustainWrapper.remove();
    $keyNamesWrapper.remove();

    const warning = document.createElement("div");
    warning.id = "no-audio-warning";
    warning.innerHTML =
      "Audio is not supported in this browser.<br />Piano features are disabled.";
    document.body.appendChild(warning);
  }
}

if (
  typeof AudioContext !== "undefined" ||
  typeof webkitAudioContext !== "undefined"
) {
  audioInit();
} else {
  $piano.remove();
  noPiano = true;
}
init();
