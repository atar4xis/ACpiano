import { rooms } from "../state/rooms.js";
import { broadcastToRoom } from "../utils/network.js";
import { noteQuotaCheck, isVanished } from "../utils/client.js";
import { intToBytes, bytesToInt } from "../utils/byte.js";
import { OPCODE } from "../config/constants.js";

export function handlePressNote(ws, payload) {
  if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
  if (rooms[ws.roomName].disablePiano) return;
  if (isVanished(ws)) return;

  const noteUid = payload[0];
  const noteVelocity = payload[1];
  const ts = bytesToInt(payload.subarray(2, 6));

  if (noteUid < 0 || noteUid > 88) return;
  if (noteVelocity < 0 || noteVelocity > 127) return;

  const srvDiff = Math.floor(process.uptime() * 1000) - ts;
  if (srvDiff < -2000 || srvDiff > 5000) return;

  if (!noteQuotaCheck(ws)) return;

  broadcastToRoom(
    ws,
    new Uint8Array([
      OPCODE.PRESS_NOTE,
      ws.clientId,
      noteUid,
      noteVelocity,
      ...intToBytes(ts),
    ]),
  );
  ws.client.noteQuota--;
  if (ws.lastPlayedNote === noteUid) ws.client.noteQuota -= 4;
  ws.lastNotePlayed = Date.now();
  ws.lastPlayedNote = noteUid;
}

export function handleReleaseNote(ws, payload) {
  if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
  if (rooms[ws.roomName].disablePiano) return;
  if (isVanished(ws)) return;

  const noteUid = payload[0];
  const allPlayings = payload[1] === 1 ? 1 : 0;
  const ts = bytesToInt(payload.subarray(2, 6));

  if (noteUid < 0 || noteUid > 88) return;

  const srvDiff = Math.floor(process.uptime() * 1000) - ts;
  if (srvDiff < -2000 || srvDiff > 5000) return;

  broadcastToRoom(
    ws,
    new Uint8Array([
      OPCODE.RELEASE_NOTE,
      ws.clientId,
      noteUid,
      allPlayings,
      ...intToBytes(ts),
    ]),
  );
}

export function handleBatchNotes(ws, payload) {
  if (!ws.roomName || !rooms[ws.roomName] || !ws.client) return;
  if (rooms[ws.roomName].disablePiano) return;
  if (isVanished(ws)) return;

  let sameNoteTimesInRow = 1;

  let i = 0;
  while (i < payload.length) {
    let opcode = payload[i++];
    if (opcode !== OPCODE.PRESS_NOTE && opcode !== OPCODE.RELEASE_NOTE) return;

    if (opcode === OPCODE.PRESS_NOTE) {
      let noteUid = payload[i++];
      if (noteUid < 0 || noteUid > 88) return;

      let noteVelocity = payload[i++];
      if (noteVelocity < 0 || noteVelocity > 127) return;

      if (!noteQuotaCheck(ws)) return;
      ws.client.noteQuota--;
      if (ws.lastPlayedNote === noteUid) {
        ws.client.noteQuota -= 2 * sameNoteTimesInRow;
        sameNoteTimesInRow++;
      }
      ws.lastNotePlayed = Date.now();
      ws.lastPlayedNote = noteUid;
    } else if (opcode === OPCODE.RELEASE_NOTE) {
      let noteUid = payload[i++];
      let allPlayings = payload[i++];

      if (
        noteUid < 0 ||
        noteUid > 88 ||
        (allPlayings !== 0 && allPlayings !== 1)
      )
        return;
    }

    let ts = bytesToInt(payload.subarray(i, i + 4));
    i += 4;
    const srvDiff = Math.floor(process.uptime() * 1000) - ts;
    if (srvDiff > 5000 || srvDiff < -2000) return;
  }

  broadcastToRoom(
    ws,
    new Uint8Array([OPCODE.BATCH_NOTES, ws.clientId, ...payload]),
  );
}
