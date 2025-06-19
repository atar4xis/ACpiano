import { rooms } from "../state/rooms.js";
import { DEFAULT_ROOM_NAME } from "../config/constants.js";

export function roomExists(roomName) {
  return rooms.hasOwnProperty(roomName);
}

export function sanitizeRoomName(roomName) {
  return roomName.replace(
    /[\x00-\x1F\x7F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
    "",
  );
}

export function validateRoomName(roomName) {
  roomName = sanitizeRoomName(roomName).trim();
  if (
    typeof roomName === "string" &&
    roomName.length > 0 &&
    roomName.length <= 60
  )
    return roomName;
  return DEFAULT_ROOM_NAME;
}

export function getFreeClientId(roomName) {
  let clientId = 0;
  while (rooms[roomName].clients.some((c) => c.clientId === clientId)) {
    clientId++;
  }
  return clientId;
}

export function isUuidInRoom(uuid, roomName) {
  return (
    roomExists(roomName) &&
    rooms[roomName].clients.some((c) => c.client.uuid === uuid)
  );
}
