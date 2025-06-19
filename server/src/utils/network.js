import { rooms } from "../state/rooms.js";
import { isVanished } from "./client.js";
import { OPCODE, SYSTEM_CLIENT_ID } from "../config/constants.js";

export function broadcastToRoom(ws, message, bypassVanish = false) {
  if (!ws.roomName || !rooms[ws.roomName]) return;
  if (isVanished(ws) && !bypassVanish) return;

  rooms[ws.roomName].clients.forEach((client) => {
    if (client === ws) return;
    client.send(message);
  });
}

export function safeClose(ws, timeout = 5000) {
  if (ws.readyState === ws.CLOSING || ws.readyState === ws.CLOSED) return;

  ws.close();

  setTimeout(() => {
    if (
      ws &&
      ws.readyState !== ws.CLOSED &&
      typeof ws.terminate === "function"
    ) {
      ws.terminate();
    }
  }, timeout);
}

export function sendSystemMsg(ws, message) {
  ws.send(
    new Uint8Array([
      OPCODE.SEND_CHAT,
      SYSTEM_CLIENT_ID,
      ...Buffer.from(JSON.stringify([null, message])),
    ]),
  );
}
