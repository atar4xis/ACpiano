import { dbRun, dbAll } from "./index.js";
import { MAX_CHAT_HISTORY } from "../config/constants.js";

export async function saveMessageToDb(
  uid,
  clientUuid,
  content,
  color,
  roomName,
) {
  await dbRun(
    `INSERT INTO messages (uid, client_uuid, content, color, room_name) VALUES (?, ?, ?, ?, ?)`,
    [uid, clientUuid, content, color, roomName],
  );
}

export async function deleteMessageFromDb(uid) {
  await dbRun(`DELETE FROM messages WHERE uid = ?`, [uid]);
}

export async function getChatHistoryFromDb(roomName) {
  return await dbAll(
    `SELECT * FROM messages WHERE room_name = ? ORDER BY timestamp DESC LIMIT ${MAX_CHAT_HISTORY}`,
    [roomName],
  );
}
