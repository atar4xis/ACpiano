import {
  OPCODE,
  RATE_LIMIT_SETTINGS,
  MAX_PLAYERS_PER_ROOM,
} from "../config/constants.js";
import { rateLimit } from "../utils/security.js";
import { validateRoomName, isUuidInRoom, roomExists } from "../utils/room.js";
import { sendSystemMsg, safeClose } from "../utils/network.js";
import { isVanished } from "../utils/client.js";
import { intToBytes } from "../utils/byte.js";

import {
  joinRoom,
  leaveRoom,
  updateCursorPosition,
  setRoomSettings,
} from "../services/roomManager.js";
import { handleChatMessage, sendChatHistory } from "../services/chatManager.js";
import {
  handlePressNote,
  handleReleaseNote,
  handleBatchNotes,
} from "../services/pianoManager.js";
import { handleClientNameUpdate } from "../services/clientManager.js";
import { rooms } from "../state/rooms.js";

export async function handleMessage(ws, data) {
  const opcode = data[0];
  const payload = data.subarray(1);

  switch (opcode) {
    case OPCODE.JOIN_ROOM: {
      if (
        !rateLimit(
          ws,
          "joinRoom",
          RATE_LIMIT_SETTINGS.JOIN_ROOM.reqs,
          RATE_LIMIT_SETTINGS.JOIN_ROOM.ms,
        )
      )
        return;
      if (!ws.client) return;

      let targetRoomName = validateRoomName(payload.toString("utf8"));

      if (isUuidInRoom(ws.client.uuid, targetRoomName)) {
        sendSystemMsg(ws, "You are already in this room.");
        safeClose(ws);
        return;
      }

      if (
        roomExists(targetRoomName) &&
        rooms[targetRoomName].clients.length >= MAX_PLAYERS_PER_ROOM &&
        !isVanished(ws)
      ) {
        sendSystemMsg(ws, "This room is full.");
        return;
      }

      if (ws.roomName) leaveRoom(ws);
      joinRoom(ws, targetRoomName);
      console.log(`${ws.client.username} joined room: ${ws.roomName}`);
      await sendChatHistory(ws);
      break;
    }
    case OPCODE.SET_CURSOR_POS: {
      if (
        !rateLimit(
          ws,
          "setCursorPos",
          RATE_LIMIT_SETTINGS.SET_CURSOR_POS.reqs,
          RATE_LIMIT_SETTINGS.SET_CURSOR_POS.ms,
        )
      )
        return;
      if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
      if (isVanished(ws)) return;

      updateCursorPosition(ws, payload);
      break;
    }
    case OPCODE.PRESS_NOTE: {
      if (
        !rateLimit(
          ws,
          "playNote",
          RATE_LIMIT_SETTINGS.PLAY_NOTE.reqs,
          RATE_LIMIT_SETTINGS.PLAY_NOTE.ms,
        )
      )
        return;
      handlePressNote(ws, payload);
      break;
    }
    case OPCODE.RELEASE_NOTE: {
      if (
        !rateLimit(
          ws,
          "releaseNote",
          RATE_LIMIT_SETTINGS.RELEASE_NOTE.reqs,
          RATE_LIMIT_SETTINGS.RELEASE_NOTE.ms,
        )
      )
        return;
      handleReleaseNote(ws, payload);
      break;
    }
    case OPCODE.BATCH_NOTES: {
      if (
        !rateLimit(
          ws,
          "batchNotes",
          RATE_LIMIT_SETTINGS.BATCH_NOTES.reqs,
          RATE_LIMIT_SETTINGS.BATCH_NOTES.ms,
        )
      )
        return;
      handleBatchNotes(ws, payload);
      break;
    }
    case OPCODE.SEND_CHAT: {
      if (
        !rateLimit(
          ws,
          "sendChat",
          RATE_LIMIT_SETTINGS.SEND_CHAT.reqs,
          RATE_LIMIT_SETTINGS.SEND_CHAT.ms,
        )
      )
        return;
      await handleChatMessage(ws, payload.toString("utf8").trim());
      break;
    }
    case OPCODE.SET_NAME: {
      if (
        !rateLimit(
          ws,
          "setName",
          RATE_LIMIT_SETTINGS.SET_NAME.reqs,
          RATE_LIMIT_SETTINGS.SET_NAME.ms,
        )
      )
        return;
      if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
      handleClientNameUpdate(ws, payload.toString("utf8").trim());
      break;
    }
    case OPCODE.UPDATE_ROOM_SETTINGS: {
      if (
        !rateLimit(
          ws,
          "setRoomSettings",
          RATE_LIMIT_SETTINGS.SET_ROOM_SETTINGS.reqs,
          RATE_LIMIT_SETTINGS.SET_ROOM_SETTINGS.ms,
        )
      )
        return;
      if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
      setRoomSettings(ws, payload);
      break;
    }
    case OPCODE.PING: {
      if (
        !rateLimit(
          ws,
          "pingPong",
          RATE_LIMIT_SETTINGS.PING_PONG.reqs,
          RATE_LIMIT_SETTINGS.PING_PONG.ms,
        )
      )
        return;
      if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;

      const pong = new Uint8Array([
        OPCODE.PONG,
        ...intToBytes(Math.floor(process.uptime() * 1000)),
      ]);
      ws.send(pong);
      break;
    }
    default:
      console.log(`Unknown opcode (${opcode}) received from ${ws.data.ip}`);
      break;
  }
}
