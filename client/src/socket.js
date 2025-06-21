import { playKey, fadeOutKey } from "./audio.js";
import { appendChat } from "./chat.js";
import { bobPlayerEl, invalidateSelfCursor } from "./input.js";
import { keys } from "./piano.js";
import { bytes, bytesToInt, bytesToShort, truncateTextWidth } from "./utils.js";
import {
  $chat,
  $status,
  $piano,
  $players,
  $cursors,
  $messages,
  $roomList,
  $roomInfo,
  $roomSelector,
  $roomSettingsBtn,
  $newRoomBtn,
} from "./dom.js";
import Worker from "./worker.js?worker";
import { OPCODE } from "./constants.js";

let socket = null;
let connectionAttempts = 0;
let players = [];
let clientIdMap = new Map(); // maps client IDs to player objects
export let myPlayer = {};
let myUuid = null;
export let serverTimeOffset = 0;
export let pingMs = [];
let lastPingTime = 0;
export const currentRoom = {
  name: "lobby",
  settings: {
    hidden: false,
    chatFilter: true,
    disableChat: false,
  },
};

const worker = new Worker();

worker.onmessage = (e) => {
  const { type, data } = e.data;

  if (type === "playNote") {
    const event = data;

    switch (event.opcode) {
      case OPCODE.PRESS_NOTE: {
        const key = keys[event.noteUid];
        const player = getPlayerById(event.clientId);
        if (!player) return;
        const $player = document.getElementById("player_" + event.clientId);
        const velocity = event.velocity / 127;
        playKey(key, player.color, velocity);
        bobPlayerEl($player);
        break;
      }
      case OPCODE.RELEASE_NOTE: {
        const key = keys[event.noteUid];
        const allPlayings = event.allPlayings;
        const player = getPlayerById(event.clientId);
        if (!player) return;
        fadeOutKey(key, allPlayings);
        break;
      }
    }
  }
};

function getPlayerById(clientId) {
  if (clientIdMap.has(clientId)) return clientIdMap.get(clientId);
  const player = players.find((p) => p.id === clientId);
  if (!player) return null;
  clientIdMap.set(clientId, player);
  return player;
}

export function getCurrentRoom() {
  return currentRoom;
}

function updateStatus() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    $status.style.display = "block";
    $status.textContent = "Connecting...";
    return;
  }
  $status.textContent =
    players.length +
    " " +
    (players.length === 1 ? "person is" : "people are") +
    " playing";
  document.title = "ACpiano (" + players.length + ") - " + currentRoom.name;

  $roomList.style.left = $roomSelector.offsetLeft + "px";
}

function addPlayer(player) {
  players.push(player);

  if (player.me) myPlayer = player;

  const $player = document.createElement("div");
  $player.className =
    "player" + (player.me ? " me" : "") + (player.crown ? " owner" : "");
  $player.textContent = truncateTextWidth(player.username, 400);
  $player.style.background = player.color;
  $player.dataset.uuid = player.uuid;
  $player.id = "player_" + player.id;
  if (player.me) {
    if (player.crown) {
      $roomSettingsBtn.style.display = "block";
    } else {
      $roomSettingsBtn.style.display = "none";
    }

    $player.addEventListener("click", () => {
      Swal.fire({
        heightAuto: false,
        title: "Change Name",
        input: "text",
        inputPlaceholder: player.username,
        showCancelButton: true,
        inputValidator: (value) => {
          const alphaNumericCharCount = value.replace(
            /[^a-zA-Z0-9]/g,
            "",
          ).length;

          if (value.length > 60)
            return "Name must be between 1 and 60 characters.";

          if (alphaNumericCharCount === 0)
            return "Name must contain at least one alphanumeric character.";
        },
      }).then((result) => {
        if (!result.isConfirmed || !result.value) return;
        send(new Uint8Array([11, ...new TextEncoder().encode(result.value)]));
      });
    });
  } else
    $player.addEventListener("click", () => {
      Swal.fire({
        heightAuto: false,
        color: "#cecece",
        width: 600,
        titleText: "UUID of " + $player.textContent,
        html: player.uuid
          ? '<code style="font-size:.8rem;background:#333;padding:3px">' +
            player.uuid +
            "</code>"
          : "(none)",
      });
    });

  $players.appendChild($player);

  if (!player.me || localStorage.getItem("piano_showselfcursor") === "true") {
    const $cursor = document.createElement("div");
    const $cursors = document.getElementById("cursors");
    const $svg = document.createElement("div");
    const $nametag = document.createElement("span");
    $cursor.className = "cursor";
    $cursor.id = "cursor_" + player.id;
    if (player.me) $cursor.id = "cursor_self";
    $cursor.style.background = player.color;
    $cursor.style.top = "-100%";
    $cursor.style.left = "-100%";
    $cursor.dataset.uuid = player.uuid;
    $cursor.dataset.lm = Date.now();
    $nametag.textContent = truncateTextWidth(player.username, 400);
    $svg.className = "icon";
    $svg.innerHTML =
      '<svg width="28" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.92098 2.29951C6.93571 1.5331 5.5 2.23523 5.5 3.48349V20.4923C5.5 21.9145 7.2945 22.5382 8.17661 21.4226L12.3676 16.1224C12.6806 15.7267 13.1574 15.4958 13.6619 15.4958H20.5143C21.9425 15.4958 22.5626 13.6887 21.4353 12.8119L7.92098 2.29951Z" fill="' +
      player.color +
      '"/></svg>';
    $cursor.appendChild($svg);
    $cursor.appendChild($nametag);

    $cursors.appendChild($cursor);
  }

  updateStatus();
}

function removePlayer(uuid) {
  const player = players.find((p) => p.uuid === uuid);
  if (!player) return;

  clientIdMap.delete(player.id);
  players = players.filter((p) => p.uuid !== uuid);

  document.querySelectorAll(`.player[data-uuid="${uuid}"]`).forEach((el) => {
    el.remove();
  });

  document.querySelectorAll(`.cursor[data-uuid="${uuid}"]`).forEach((el) => {
    el.remove();
  });

  updateStatus();
}

export function getSocket() {
  return socket;
}

export function send(byteArray) {
  if (!socket) return;
  if (socket.readyState !== WebSocket.OPEN) return;
  const buffer = new Uint8Array(byteArray);
  socket.send(buffer);
}

export async function receive(data) {
  const opcode = data[0];
  const payload = data.slice(1);

  switch (opcode) {
    case OPCODE.JOIN_ROOM: {
      connectionAttempts = 0;
      players = [];
      clientIdMap.clear();
      myUuid = new TextDecoder().decode(payload);

      updateStatus();

      $players.innerHTML = "";
      $cursors.innerHTML = "";
      $messages.innerHTML = "";

      invalidateSelfCursor();
      break;
    }
    case OPCODE.PLAYER_JOINED: {
      const player = JSON.parse(new TextDecoder().decode(payload));

      addPlayer({
        uuid: player[0],
        username: player[1],
        color: player[2],
        id: player[3],
        me: myUuid == player[0],
        crown: player[4],
      });
      break;
    }
    case OPCODE.PLAYER_LEFT: {
      const puid = new TextDecoder().decode(payload);
      removePlayer(puid);
      break;
    }
    case OPCODE.CURSOR_UPDATE: {
      let i = 0;

      while (i < payload.length) {
        const clientId = payload[i++];
        const player = getPlayerById(clientId);
        if (!player) return;

        // skip to next client if cursor not found
        const $cursor = document.getElementById("cursor_" + clientId);
        if (!$cursor) {
          const eventNum = payload[i++];
          i += eventNum * 6; // skip all events, 6 bytes per event
          continue;
        }

        const eventNum = payload[i++];

        for (let j = 0; j < eventNum; j++) {
          const timeOffset = bytesToShort(payload.slice(i, i + 2));
          i += 2;

          const xPercent = bytesToShort(payload.slice(i, i + 2)) / 100;
          i += 2;

          const yPercent = bytesToShort(payload.slice(i, i + 2)) / 100;
          i += 2;

          setTimeout(() => {
            $cursor.style.left = xPercent + "%";
            $cursor.style.top = yPercent + "%";
            $cursor.dataset.lm = Date.now();
            $cursor.style.opacity = "1";
          }, timeOffset);
        }
      }

      break;
    }
    case OPCODE.PRESS_NOTE: {
      const clientId = payload[0];
      const noteUid = payload[1];
      const velocity = payload[2];
      const ts = bytesToInt(payload.slice(3, 7));
      const player = getPlayerById(clientId);
      if (!player) return;

      worker.postMessage({
        type: "addEvent",
        data: {
          ts,
          opcode: 5,
          noteUid,
          clientId,
          velocity,
        },
      });

      break;
    }
    case OPCODE.RELEASE_NOTE: {
      const clientId = payload[0];
      const noteUid = payload[1];
      const allPlayings = payload[2] === 1;
      const ts = bytesToInt(payload.slice(3, 7));
      const player = getPlayerById(clientId);
      if (!player) return;

      worker.postMessage({
        type: "addEvent",
        data: {
          ts,
          opcode: 6,
          noteUid,
          allPlayings,
          clientId,
        },
      });

      break;
    }
    case OPCODE.BATCH_NOTES: {
      let i = 0;
      let clientId = payload[i++];
      const player = getPlayerById(clientId);
      if (!player) return;

      while (i < payload.length) {
        let opcode = payload[i++];
        let noteUid = payload[i++];
        switch (opcode) {
          case OPCODE.PRESS_NOTE: {
            let velocity = payload[i++];
            let ts = bytesToInt(payload.slice(i, i + 4));
            i += 4;
            worker.postMessage({
              type: "addEvent",
              data: {
                ts,
                opcode: 5,
                noteUid,
                clientId,
                velocity,
              },
            });
            break;
          }
          case OPCODE.RELEASE_NOTE: {
            let allPlayings = payload[i++];
            let ts = bytesToInt(payload.slice(i, i + 4));
            i += 4;
            worker.postMessage({
              type: "addEvent",
              data: {
                ts,
                opcode: 6,
                noteUid,
                allPlayings: allPlayings === 1,
                clientId,
              },
            });
            break;
          }
        }
      }
      break;
    }
    case OPCODE.SEND_CHAT: {
      const clientId = payload[0];
      const message = JSON.parse(new TextDecoder().decode(payload.slice(1)));
      const player = getPlayerById(clientId);
      if (!player && clientId != 255) return;

      // if clientId is 255, it's a server message
      if (clientId == 255) {
        appendChat(null, "Server", message[1], "red");
        return;
      }

      appendChat(
        message[0],
        player.username,
        message[1],
        player.color,
        player.uuid,
      );

      break;
    }
    case OPCODE.CHAT_HISTORY: {
      const messages = JSON.parse(new TextDecoder().decode(payload));

      for (const msg of messages) {
        appendChat(msg[1], msg[2], msg[3], msg[4], msg[0]);
      }
      break;
    }
    case OPCODE.ROOM_LIST: {
      const rooms = JSON.parse(new TextDecoder().decode(payload));
      const $picker = document.getElementById("room-list");
      const $button = document.getElementById("room-selector");
      $picker.innerHTML = "";

      let selectedValue = null;
      rooms.sort((a, b) => a[0] > b[0]);

      for (const room of rooms) {
        const $option = document.createElement("div");
        const $memberCount = document.createElement("span");

        $option.className = "room" + (room[5] ? " hidden" : "");
        $option.textContent = room[1];
        if (room[1] === "lobby") {
          $option.style.color = "#91ffb2";
        }

        const safeName = truncateTextWidth(room[1], 800);
        $option.textContent = safeName;

        $memberCount.textContent = room[2] + "/10";
        $memberCount.className = "member-count";
        $option.prepend($memberCount);

        // if this is the room we are in
        if (room[3]) {
          selectedValue = room[1];
          currentRoom.name = room[1];
          $button.textContent = safeName;
          updateStatus();
        }

        $option.addEventListener("click", () => {
          if (room[1] !== currentRoom.name)
            send(new Uint8Array([1, ...new TextEncoder().encode(room[1])]));

          $roomList.style.display = "none";
        });

        $picker.appendChild($option);
      }

      if (selectedValue) {
        $picker.value = selectedValue.toString();
        location.hash = `#${selectedValue}`;

        // if in lobby, remove hash
        if (selectedValue === "lobby") {
          location.hash = "";
          history.replaceState(null, "", location.pathname);
        }
      }

      break;
    }
    case OPCODE.SET_NAME: {
      const clientId = payload[0];
      const name = new TextDecoder().decode(payload.slice(1));

      const player = getPlayerById(clientId);
      if (!player) return;

      const $player = document.getElementById("player_" + clientId);
      const $cursor = document.querySelector(`#cursor_${clientId} > span`);

      player.username = name;

      if ($player) $player.textContent = truncateTextWidth(name, 400);
      if ($cursor) $cursor.textContent = truncateTextWidth(name, 400);

      if (player.me) {
        const $myCursor = document.getElementById("cursor_self");
        if ($myCursor) $myCursor.querySelector("span").textContent = name;
      }

      break;
    }
    case OPCODE.DELETE_MESSAGE: {
      const msgId = new TextDecoder().decode(payload);
      const $msg = document.getElementById("msg_" + msgId);

      if (!$msg) return;

      $msg.remove();
      break;
    }
    case OPCODE.OWNERSHIP_TRANSFER: {
      const newOwnerId = payload[0];
      const player = getPlayerById(newOwnerId);
      if (!player) return;
      const $player = document.getElementById("player_" + newOwnerId);
      if (!$player) return;

      document.querySelectorAll(".player.owner").forEach(($el) => {
        $el.classList.remove("owner");
      });

      player.crown = true;
      $player.classList.add("owner");

      $roomSettingsBtn.style.display = player.me ? "block" : "none";
      break;
    }
    case OPCODE.ROOM_SETTINGS: {
      let i = 0;

      while (i < payload.length) {
        const byte = payload[i++];
        const setting = byte >> 1; // first 7 bits are the setting ID
        const value = byte & 1; // last bit is the value (0 or 1)

        if (value !== 0 && value !== 1) {
          return; // invalid value
        }

        switch (setting) {
          case 1: {
            // hidden
            currentRoom.settings.hidden = value === 1;
            break;
          }
          case 2: {
            // chat filter
            currentRoom.settings.chatFilter = value === 1;
            break;
          }
          case 3: {
            // disable chat
            currentRoom.settings.disableChat = value === 1;
            break;
          }
          case 4: {
            // disable piano
            currentRoom.settings.disablePiano = value === 1;
            break;
          }
        }
      }

      if (currentRoom.settings.disableChat) $chat.style.display = "none";
      else $chat.style.display = "block";

      if (currentRoom.settings.disablePiano) $piano.style.display = "none";
      else $piano.style.display = "block";

      const roomInfo = [];

      if (currentRoom.settings.disableChat) roomInfo.push("Chat disabled");
      if (currentRoom.settings.disablePiano) roomInfo.push("Piano disabled");

      if (roomInfo.length > 0) {
        $roomInfo.innerHTML = roomInfo
          .map((x) => `<span>${x}</span>`)
          .join(" ");
        $roomInfo.style.display = "flex";
      } else {
        $roomInfo.style.display = "none";
      }

      break;
    }
    case OPCODE.PONG: {
      const now = performance.now();
      const serverTime = bytesToInt(payload.slice(0, 4));

      serverTimeOffset = serverTime - (lastPingTime + now) / 2;

      pingMs.push(now - lastPingTime);
      if (pingMs.length > 10) pingMs.shift(); // keep last 10 pings

      worker.postMessage({
        type: "setServerTimeOffset",
        data: serverTimeOffset,
      });
      worker.postMessage({ type: "addPing", data: now - lastPingTime });
      break;
    }
    case OPCODE.RATE_LIMITED: {
      appendChat(
        null,
        "Server",
        "You are being rate limited. Please slow down.",
        "red",
      );
      break;
    }
  }
}

export function connect(endpoint) {
  socket = new WebSocket(endpoint);
  socket.binaryType = "arraybuffer";
  socket.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    receive(data).catch(console.error);
  };
  socket.onopen = () => {
    const roomName = decodeURIComponent(location.hash.slice(1)) || "lobby";
    send([OPCODE.JOIN_ROOM, ...bytes(roomName)]);

    // send a ping every 5 seconds
    socket.pingInterval = setInterval(
      (function _() {
        lastPingTime = performance.now();
        send(new Uint8Array([OPCODE.PING, Math.floor(Math.random() * 255)]));

        // fade out inactive cursors
        const $allCursors = document.querySelectorAll(".cursor");
        $allCursors.forEach(($cursor) => {
          if ($cursor.id === "cursor_self") return; // don't fade myself
          if (Date.now() - $cursor.dataset.lm > 5000) {
            $cursor.style.opacity = "0.5";
          } else {
            $cursor.style.opacity = "1";
          }
        });

        return _;
      })(),
      5000,
    );
  };

  socket.onclose = () => {
    clearInterval(socket.pingInterval);
    clearInterval(socket.processNotesInterval);
    socket = null;
    players = [];
    $players.innerHTML = "";
    $cursors.innerHTML = "";
    $roomSettingsBtn.style.display = "none";
    updateStatus();
    if (connectionAttempts < 3) {
      setTimeout(
        () => {
          connect(endpoint);
          connectionAttempts++;
        },
        500 + connectionAttempts * 500,
      );
    } else {
      $status.textContent = "You are offline. Refresh to reconnect.";
      $roomSelector.style.display = "none";
      $newRoomBtn.style.display = "none";
    }
  };
}

// expose some variables for external use
if (!window.ACpiano) window.ACpiano = {};
window.ACpiano.socket = {
  send,
  toBytes: bytes,
  getCurrentRoom,
};
window.ACpiano.players = players;
