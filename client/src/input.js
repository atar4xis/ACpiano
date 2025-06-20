import {
  BASE_KEY_BINDINGS,
  BLACK_KEY_HEIGHT_RATIO,
  NOTES,
} from "./constants.js";
import { keys, sustain, setSustain, setKeyNames } from "./piano.js";
import {
  playKey,
  fadeOutKey,
  setMasterVolume,
  setCanPlaySound,
} from "./audio.js";
import { myPlayer, send, serverTimeOffset, getCurrentRoom } from "./socket.js";
import { intToBytes, shortToBytes } from "./utils.js";
import { appendChatTemp, setupEvents } from "./chat.js";
import {
  $audioOverlay,
  $chatInput,
  $sustainSwitch,
  $messages,
  $roomList,
  $roomSelector,
  $midiDeviceList,
  $midiDevicesBtn,
  $roomSettingsBtn,
  $newRoomBtn,
  $volume,
  $keyNamesSwitch,
} from "./dom.js";

export let baseOctave = 1;
let transpose = 0;
const heldKeys = new Set();
const sustainedKeys = new Set();
let lastKeyMoused = null;
let eventQueue = [];
let eventQueueTimeout = null;
let eventQueueStartTime = 0;
let sendCursorUpdates = !localStorage.getItem("piano_nosendcursor");
let lastCursorUpdate = 0;
let lastmxp = 0;
let lastmyp = 0;
let activeMidiInput = null;
let lVolume = localStorage.getItem("piano_volume");
lVolume = Number.isNaN(lVolume) ? undefined : lVolume;
let lShowSelfCursor = localStorage.getItem("piano_showselfcursor") === "true";
let lSustain = localStorage.getItem("piano_sustain") === "true";
let lKeyNames = localStorage.getItem("piano_keynames") === "true";

let $selfCursor = null;

export const key_binding = Object.fromEntries(
  BASE_KEY_BINDINGS.map(([code, note, offset]) => [code, { note, offset }]),
);
export const note_binding = Object.fromEntries(
  BASE_KEY_BINDINGS.map(([code, note, offset]) => [note, { code, offset }]),
);

export function invalidateSelfCursor() {
  $selfCursor = null;
}

export function applyTranspose(key) {
  let noteIndex = NOTES.indexOf(key.baseNote);
  if (noteIndex === -1) return;

  let transposedIndex = noteIndex + transpose;
  let octaveShift = Math.floor(transposedIndex / NOTES.length);
  transposedIndex =
    ((transposedIndex % NOTES.length) + NOTES.length) % NOTES.length;

  let transposedNote = NOTES[transposedIndex];
  let transposedOctave = key.octave + octaveShift;

  return keys.find((k) => k.note === transposedNote + transposedOctave);
}

export function bobPlayerEl($player) {
  if (!$player) return;
  $player.style.transform = "translateY(-2px)";
  $player.style.transition = "transform 0.01s";
  setTimeout(() => {
    $player.style.transform = "";
    $player.style.transition = "transform 0.2s";
  }, 50);
}

function sendEventQueue() {
  clearTimeout(eventQueueTimeout);
  eventQueueTimeout = null;

  if (eventQueue.length === 0) return;

  // if just one event we can send it immediately
  if (eventQueue.length === 1) {
    send(eventQueue[0]);
  }

  // if multiple events, we batch them
  if (eventQueue.length > 1) {
    const byteArray = [];

    byteArray.push(7); // batch notes opcode
    for (const event of eventQueue) {
      byteArray.push(...event);
    }

    const payload = new Uint8Array(byteArray);
    send(payload);
  }

  eventQueue = [];
}

function queueEvent(event) {
  if (eventQueue.length === 0) {
    eventQueueStartTime = performance.now();
  }
  const delta = performance.now() - eventQueueStartTime;
  eventQueue.push(event);

  if (eventQueueTimeout) clearTimeout(eventQueueTimeout);

  // if the queue is getting too long, send it
  if (delta >= 200) {
    sendEventQueue();
    return;
  }

  eventQueueTimeout = setTimeout(() => {
    sendEventQueue();
  }, 200);
}

export function press(key, noTranspose, velocity = 0.5) {
  if (!noTranspose) key = applyTranspose(key);
  if (!key) return;
  playKey(key, myPlayer?.color, velocity);

  const ts = performance.now() + serverTimeOffset;
  queueEvent(
    new Uint8Array([5, key.uid, Math.round(velocity * 127), ...intToBytes(ts)]),
  );

  if (myPlayer) bobPlayerEl(document.getElementById("player_" + myPlayer.id));
}

export function release(key, noTranspose, allPlayings) {
  if (!noTranspose) key = applyTranspose(key);
  if (!key) return;
  fadeOutKey(key, allPlayings);

  const ts = performance.now() + serverTimeOffset;
  queueEvent(
    new Uint8Array([6, key.uid, allPlayings ? 1 : 0, ...intToBytes(ts)]),
  );
}

export function attachInputHandlers(piano) {
  setupEvents(); // chat setup

  document.addEventListener("keydown", (e) => {
    if ($audioOverlay) $audioOverlay.click();

    if (e.ctrlKey && e.code === "KeyC") return;

    baseOctave = e.shiftKey ? 2 : 1;
    if (heldKeys.has(e.code)) return;

    if (document.activeElement === $chatInput) return;
    if (document.querySelector("em-emoji-picker")) return;

    if (e.code == "Backspace") {
      $sustainSwitch.click();
      e.preventDefault();
      return;
    }

    if (e.code == "Space") {
      if (!sustain) {
        setSustain("pedal");
        $sustainSwitch.checked = true;
      }
      e.preventDefault();
      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();

      switch (e.code) {
        case "ArrowUp":
          transpose++;
          break;
        case "ArrowDown":
          transpose--;
          break;
        case "ArrowRight":
          transpose += 12;
          break;
        case "ArrowLeft":
          transpose -= 12;
          break;
      }

      if (transpose > 36) transpose = 36;
      if (transpose < -36) transpose = -36;

      appendChatTemp(2000, "System", "Transpose: " + transpose, "#8e8e8e");
      return;
    }

    if (e.code == "Delete") {
      if (e.ctrlKey) {
        if (lShowSelfCursor) {
          localStorage.removeItem("piano_showselfcursor");
          appendChatTemp(2000, "System", "Hiding own cursor...", "#8e8e8e");
          setTimeout(() => location.reload(), 1000);
        } else {
          localStorage.setItem("piano_showselfcursor", "true");
          appendChatTemp(2000, "System", "Showing own cursor...", "#8e8e8e");
          setTimeout(() => location.reload(), 1000);
        }
        return;
      }
      sendCursorUpdates = !sendCursorUpdates;
      appendChatTemp(
        2000,
        "System",
        "Send cursor updates: " + (sendCursorUpdates ? "yes" : "no"),
        "#8e8e8e",
      );
      if (!sendCursorUpdates)
        localStorage.setItem("piano_nosendcursor", "true");
      else localStorage.removeItem("piano_nosendcursor");
      return;
    }

    const key = getKeyFromKeyboardEvent(e);
    if (!key) return;

    e.preventDefault();

    heldKeys.add(e.code);
    if (sustain === "pedal") sustainedKeys.add(key);

    press(key);
  });

  document.addEventListener("keypress", (e) => {
    if ($audioOverlay) $audioOverlay.click();

    if (document.querySelector("em-emoji-picker")) return;
    if (document.activeElement.tagName === "INPUT") return;
    if (e.ctrlKey && e.code === "KeyC") return;
    if (key_binding[e.code]) e.preventDefault();
  });

  document.addEventListener("keyup", (e) => {
    if (document.activeElement.tagName === "INPUT") return;
    baseOctave = e.shiftKey ? 2 : 1;

    if (e.code == "Space") {
      if (sustain === "pedal") {
        setSustain(false);
        for (const key of sustainedKeys) {
          release(key, false, true);
        }
        $sustainSwitch.checked = false;
        e.preventDefault();
      }
    }

    heldKeys.delete(e.code);
    const key = getKeyFromKeyboardEvent(e);
    if (key && key_binding[e.code] && !sustain) release(key);
  });

  const mouseDownHandler = (e) => {
    const key = getKeyFromMouseEvent(e, piano);
    if (key) {
      lastKeyMoused = key;
      press(key, true);
    }
  };

  if (piano) piano.addEventListener("mousedown", mouseDownHandler);

  document.addEventListener("mousemove", (e) => {
    if (performance.now() - lastCursorUpdate < 40) return;

    const xPercent = Math.round((e.clientX / window.innerWidth) * 10000) / 100;
    const yPercent = Math.round((e.clientY / window.innerHeight) * 10000) / 100;

    // move self for instant feedback
    if (sendCursorUpdates) {
      if (!$selfCursor) $selfCursor = document.querySelector("#cursor_self");
      if ($selfCursor) {
        $selfCursor.style.left = xPercent + "%";
        $selfCursor.style.top = yPercent + "%";
        $selfCursor.dataset.lm = performance.now();
        $selfCursor.style.opacity = "1";
      }
    }

    if (
      sendCursorUpdates &&
      (Math.abs(xPercent - lastmxp) > 0.25 ||
        Math.abs(yPercent - lastmyp) > 0.15)
    ) {
      const packet = new Uint8Array([
        3,
        ...shortToBytes(Math.floor(xPercent * 100)),
        ...shortToBytes(Math.floor(yPercent * 100)),
      ]);

      // TODO: send in batches
      send(packet);

      lastmxp = xPercent;
      lastmyp = yPercent;

      lastCursorUpdate = performance.now();
    }
  });

  document.addEventListener("mouseup", () => {
    if (sustain || !lastKeyMoused) return;
    release(lastKeyMoused, true);
    lastKeyMoused = null;
  });

  $messages.addEventListener("click", () => {
    if (document.activeElement.tagName === "INPUT") {
      document.activeElement.blur();
    }
  });

  $audioOverlay.addEventListener("click", () => {
    setCanPlaySound(true);
    $audioOverlay.remove();
  });

  document.addEventListener("click", (e) => {
    const clickedSelector = e.target.closest("#room-selector");
    const clickedList = e.target.closest("#room-list");

    if (clickedSelector) {
      $roomList.style.display =
        $roomList.style.display === "block" ? "none" : "block";
    } else if (!clickedList) {
      $roomList.style.display = "none";
    }

    if ($roomList.style.display === "block") {
      $roomList.style.bottom =
        window.innerHeight - $roomSelector.getBoundingClientRect().top + "px";
      $roomList.style.left = $roomSelector.getBoundingClientRect().left + "px";
      $roomList.style.width = $roomSelector.offsetWidth + "px";
      $roomSelector.classList.add("active");
    } else {
      $roomSelector.classList.remove("active");
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("#midi-devices")) {
      $midiDeviceList.classList.toggle("active");

      $midiDeviceList.style.left =
        $midiDevicesBtn.getBoundingClientRect().left +
        $midiDevicesBtn.offsetWidth / 2 +
        "px";

      navigator
        .requestMIDIAccess()
        .then((midiAccess) => {
          $midiDeviceList.innerHTML = "<h2>MIDI Input</h2>";
          midiAccess.inputs.forEach((input) => {
            const $device = document.createElement("div");

            $device.className = "midi-device";
            $device.textContent = input.name;

            if (activeMidiInput && activeMidiInput.id === input.id) {
              $device.classList.add("active");
            }

            $device.addEventListener("click", () => {
              document.querySelectorAll(".midi-device").forEach((d) => {
                d.classList.remove("active");
              });
              $device.classList.add("active");

              if (activeMidiInput) activeMidiInput.onmidimessage = null;
              activeMidiInput = input;

              activeMidiInput.onmidimessage = (event) => {
                const command = event.data[0] >> 4;
                // const channel = event.data[0] & 0xf;
                const note = event.data[1];
                const velocity = event.data[2] / 127;

                switch (command) {
                  case 9: {
                    // note on
                    press(keys[note - 21], false, velocity);
                    break;
                  }
                  case 8: {
                    // note off
                    if (!sustain) release(keys[note - 21]);
                    break;
                  }
                  case 11: {
                    // set controller value
                    if (note === 64) {
                      // sustain pedal
                      setSustain(velocity > 0);
                      $sustainSwitch.checked = velocity > 0;
                    }
                    break;
                  }
                }
              };
            });

            $midiDeviceList.appendChild($device);
          });
        })
        .catch((err) => {
          $midiDeviceList.innerHTML = `<div class="error"><h2>Error</h2> ${err.message}</div>`;
        });
    } else if (
      $midiDeviceList.classList.contains("active") &&
      !e.target.closest("#midi-device-list")
    ) {
      $midiDeviceList.classList.remove("active");
    }
  });

  $roomSettingsBtn.addEventListener("click", () => {
    const settings = getCurrentRoom().settings || {};
    Swal.fire({
      heightAuto: false,
      title: "Room Settings",
      html: `
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;text-align:left;margin:1em 0;">
            <sl-switch name="1" ${settings.hidden ? "checked" : ""}>Hidden</sl-switch>
            <sl-switch name="2" ${settings.chatFilter ? "checked" : ""}>Chat filter</sl-switch>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;text-align:left;margin:1em 0;">
            <sl-switch name="3" ${settings.disableChat ? "checked" : ""}>Disable chat</sl-switch>
            <sl-switch name="4" ${settings.disablePiano ? "checked" : ""}>Disable piano</sl-switch>
          </div>
        </div>
      `,
      color: "#cecece",
      showCancelButton: true,
      confirmButtonText: `<svg width="20px" height="20px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-242.7c0-17-6.7-33.3-18.7-45.3L352 50.7C340 38.7 323.7 32 306.7 32L64 32zm0 96c0-17.7 14.3-32 32-32l192 0c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32L96 224c-17.7 0-32-14.3-32-32l0-64zM224 288a64 64 0 1 1 0 128 64 64 0 1 1 0-128z" fill="#ffffff"/></svg> Save`,
      customClass: {
        confirmButton: "save-button",
      },
      reverseButtons: true,
    }).then((result) => {
      if (!result.isConfirmed) return;

      const payload = [];

      payload.push(12); // set room settings opcode

      for (const el of Swal.getPopup().querySelectorAll("sl-switch")) {
        // last bit is 1 if enabled
        payload.push((parseInt(el.name) << 1) | (el.checked ? 1 : 0));
      }

      send(payload);
    });
  });

  $newRoomBtn.addEventListener("click", () => {
    Swal.fire({
      heightAuto: false,
      title: "Create New Room",
      input: "text",
      inputPlaceholder: "Enter room name",
      color: "#cecece",
      html: '<sl-switch id="make-private">Hide from room list</sl-switch>',
      showCancelButton: true,
      inputValidator: (value) => {
        if (value.length > 60)
          return "Name must be between 1 and 60 characters.";
      },
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      const makePrivate = document.querySelector("#make-private");
      if (makePrivate.checked) result.value = "/hidden:" + result.value;
      makePrivate.remove();
      send(new Uint8Array([1, ...new TextEncoder().encode(result.value)]));
    });
  });

  $volume.addEventListener("sl-input", (e) => {
    setMasterVolume(e.target.input.value);
  });

  $volume.addEventListener("sl-change", (e) => {
    localStorage.setItem("piano_volume", e.target.input.value);
  });
  $volume.value = lVolume || 50;

  $sustainSwitch.addEventListener("sl-change", (e) => {
    setSustain(e.target.checked);
    localStorage.setItem("piano_sustain", e.target.checked);
  });
  $sustainSwitch.checked = lSustain;
  setSustain(lSustain);

  $keyNamesSwitch.addEventListener("sl-change", (e) => {
    setKeyNames(e.target.checked);
    localStorage.setItem("piano_keynames", e.target.checked);
  });
  $keyNamesSwitch.checked = lKeyNames;
  setKeyNames(lKeyNames);
}

function getKeyFromKeyboardEvent(e) {
  const entry = key_binding[e.code];
  if (!entry) return;

  let octave = baseOctave + entry.offset;
  return keys.find((k) => k.note === `${entry.note}${octave}`);
}

function getKeyFromMouseEvent(e, piano) {
  // prioritize black match
  let blackMatch = keys.find(
    (k) =>
      k.sharp &&
      e.offsetY < piano.height * BLACK_KEY_HEIGHT_RATIO &&
      e.offsetX < k.x + k.width &&
      e.offsetX > k.x,
  );
  if (blackMatch) return blackMatch;
  else
    return keys.find(
      (k) =>
        !k.sharp &&
        e.offsetY < piano.height &&
        e.offsetX > k.x &&
        e.offsetX < k.x + k.width,
    );
}

// expose some variables for external use
if (!window.ACpiano) window.ACpiano = {};
window.ACpiano.input = {
  playKey,
  press,
  release,
};
