import { rooms } from "../state/rooms.js";
import { OPCODE } from "../config/constants.js";
import {
  roomExists,
  sanitizeRoomName,
  getFreeClientId,
} from "../utils/room.js";
import { broadcastToRoom, sendSystemMsg } from "../utils/network.js";
import { getChatHistoryFromDb } from "../db/message.js";
import { isVanished } from "../utils/client.js";
import { shortToBytes, bytesToShort } from "../utils/byte.js";

const cursorUpdateIntervals = {};

export function createRoom(roomName, ownerWs, persistent, hidden) {
  roomName = sanitizeRoomName(roomName);

  rooms[roomName] = {
    name: roomName,
    clients: [],
    owner: ownerWs,
    created: Date.now(),
    hidden: hidden || false,
    chat: [],
    cursors: {},
    persistent: persistent || false,
    chatFilter: true,
    disableChat: false,
    disablePiano: false,
    cursorUpdateInterval: null,
    ownershipTransferTimeoutId: null,
  };

  if (persistent) {
    getChatHistoryFromDb(roomName).then(async (rows) => {
      const chatMessages = [];
      for (const row of rows) {
        chatMessages.push([row.client_uuid, row.uid, row.content, row.color]);
      }
      rooms[roomName].chat = chatMessages;
    });
  }
}

export function joinRoom(ws, roomName) {
  let hidden = false;

  if (roomName.startsWith("/hidden:")) {
    roomName = roomName.slice(8);
    hidden = true;
  }

  if (!roomExists(roomName)) {
    createRoom(roomName, ws, false, hidden);
  }

  ws.roomName = roomName;

  rooms[roomName].clients.push(ws);

  let clientId = getFreeClientId(ws.roomName);
  ws.clientId = clientId;

  // announce to the room (new player joined)
  const newPlayer = JSON.stringify([
    ws.client.uuid,
    ws.client.username,
    ws.client.color,
    ws.clientId,
    ws.client.uuid === rooms[roomName].owner?.client?.uuid ? 1 : 0,
  ]);
  broadcastToRoom(
    ws,
    new Uint8Array([OPCODE.PLAYER_JOINED, ...Buffer.from(newPlayer)]),
  );

  // send own uuid
  ws.send(new Uint8Array([OPCODE.JOIN_ROOM, ...Buffer.from(ws.client.uuid)]));

  // send players already in the room to the new client
  rooms[roomName].clients.forEach((c) => {
    if (isVanished(c)) return;
    const existingPlayerPayload = JSON.stringify([
      c.client.uuid,
      c.client.username,
      c.client.color,
      c.clientId,
      c.client.uuid === rooms[roomName].owner?.client?.uuid ? 1 : 0,
    ]);
    ws.send(
      new Uint8Array([
        OPCODE.PLAYER_JOINED,
        ...Buffer.from(existingPlayerPayload),
      ]),
    );
  });

  // send cursor positions
  const cursorPayload = [];
  Object.values(rooms[roomName].cursors).forEach((cursor) => {
    cursorPayload.push(
      cursor.cid,
      1, // number of events (always 1 for initial sync)
      ...shortToBytes(0), // timestamp offset
      ...shortToBytes(cursor.x * 100),
      ...shortToBytes(cursor.y * 100),
    );
  });
  if (cursorPayload.length > 0)
    ws.send(new Uint8Array([OPCODE.CURSOR_UPDATE, ...cursorPayload]));

  // send room settings
  const settingsPayload = [];
  const settingsList = ["hidden", "chatFilter", "disableChat", "disablePiano"];
  settingsList.forEach((setting, index) => {
    settingsPayload.push(
      ((index + 1) << 1) | (rooms[roomName][setting] ? 1 : 0),
    );
  });
  if (settingsPayload.length > 0)
    ws.send(new Uint8Array([OPCODE.ROOM_SETTINGS, ...settingsPayload]));

  // if vanished, let them know
  if (isVanished(ws)) {
    setTimeout(() => {
      sendSystemMsg(ws, "You are in vanished mode. Others won't see you.");
    }, 500);
  }

  broadcastRoomList(); // update room list for everyone

  // start cursor position update interval if not already running
  if (rooms[roomName].clients.length > 0 && !cursorUpdateIntervals[roomName]) {
    cursorUpdateIntervals[roomName] = setInterval(() => {
      const room = rooms[roomName];
      if (!room || room.clients.length === 0) {
        clearInterval(cursorUpdateIntervals[roomName]);
        delete cursorUpdateIntervals[roomName];
        return;
      }

      const needUpdate = [];
      Object.values(room.cursors).forEach((cursor) => {
        if (cursor && cursor.eventQueue && cursor.eventQueue.length > 0) {
          needUpdate.push(cursor);
        }
      });

      if (needUpdate.length === 0) return;

      const payload = [];
      for (let cursor of needUpdate) {
        payload.push(cursor.cid);
        payload.push(cursor.eventQueue.length);

        for (let [t, x, y] of cursor.eventQueue) {
          payload.push(
            ...shortToBytes(t),
            ...shortToBytes(Math.floor(x * 100)),
            ...shortToBytes(Math.floor(y * 100)),
          );
          cursor.lastX = x;
          cursor.lastY = y;
        }
        cursor.eventQueue = [];
        cursor.eventQueueStartTime = null;
      }

      room.clients.forEach((client) => {
        client.send(new Uint8Array([OPCODE.CURSOR_UPDATE, ...payload]));
      });
    }, 500);
  }

  // cancel pending ownership transfer if the owner rejoins
  if (rooms[roomName].ownershipTransferTimeoutId) {
    const originalOwnerUuid = rooms[roomName].owner?.client?.uuid;
    if (originalOwnerUuid === ws.client.uuid) {
      clearTimeout(rooms[roomName].ownershipTransferTimeoutId);
      rooms[roomName].ownershipTransferTimeoutId = null;
      console.log(
        `The owner of ${roomName} rejoined. Ownership transfer cancelled.`,
      );
    }
  }
}

export function leaveRoom(ws) {
  if (!ws.roomName || !roomExists(ws.roomName)) return;

  const room = rooms[ws.roomName];

  if (room.clients.includes(ws)) {
    broadcastToRoom(
      ws,
      new Uint8Array([OPCODE.PLAYER_LEFT, ...Buffer.from(ws.client.uuid)]),
    );

    const clientLeaving = room.clients.find((c) => c === ws);

    // if owner leaves, transfer ownership
    if (
      clientLeaving &&
      room.owner &&
      room.owner.client.uuid === clientLeaving.client.uuid
    ) {
      const roomName = room.name;

      // clear any existing ownership transfer timeout
      if (room.ownershipTransferTimeoutId) {
        clearTimeout(room.ownershipTransferTimeoutId);
        room.ownershipTransferTimeoutId = null;
      }

      room.ownershipTransferTimeoutId = setTimeout(() => {
        if (roomExists(roomName)) {
          const r = rooms[roomName];
          const clientCount = r.clients.length;
          const cameBack = r.clients.some(
            (c) => c.client.uuid === clientLeaving.client.uuid,
          );
          if (!cameBack && clientCount > 0) {
            const newOwner = r.clients[0];
            if (!newOwner || newOwner.client.uuid === clientLeaving.client.uuid)
              return;
            r.owner = newOwner;
            r.clients.forEach((c) => {
              c.send(
                new Uint8Array([OPCODE.OWNERSHIP_TRANSFER, newOwner.clientId]),
              );
            });
            sendSystemMsg(newOwner, "You are now the owner of this room.");
            console.log(
              `Ownership of room ${roomName} transferred to ${newOwner.client.username}.`,
            );

            r.ownershipTransferTimeoutId = null;
          }
        }
      }, 5000);
    }

    if (room.cursors[ws.client.uuid]) {
      delete room.cursors[ws.client.uuid];
    }

    room.clients = room.clients.filter((c) => c !== ws);
  }

  // stop sending cursor positions if all clients left
  if (
    rooms[ws.roomName].clients.length === 0 &&
    cursorUpdateIntervals[ws.roomName]
  ) {
    clearInterval(cursorUpdateIntervals[ws.roomName]);
    delete cursorUpdateIntervals[ws.roomName];
  }

  // delete room if empty and not persistent
  if (
    rooms[ws.roomName].clients.length === 0 &&
    !rooms[ws.roomName].persistent
  ) {
    console.log(`Room ${ws.roomName} is empty so it will be deleted.`);
    delete rooms[ws.roomName];
  }

  broadcastRoomList();
}

export function sendRoomList(ws) {
  const visibleRooms = Object.keys(rooms).filter(
    (roomName) =>
      !rooms[roomName].hidden || (ws.client && ws.roomName === roomName),
  );

  const roomList = visibleRooms.map((roomName, i) => [
    i,
    roomName,
    rooms[roomName].clients.filter((c) => !isVanished(c)).length,
    ws.roomName === roomName ? 1 : 0,
    rooms[roomName].persistent ? 1 : 0,
    rooms[roomName].hidden,
  ]);

  ws.send(
    new Uint8Array([
      OPCODE.ROOM_LIST,
      ...Buffer.from(JSON.stringify(roomList)),
    ]),
  );
}

export function broadcastRoomList() {
  Object.keys(rooms).forEach((r) => {
    rooms[r].clients.forEach((client) => {
      sendRoomList(client);
    });
  });
}

export function updateCursorPosition(ws, payload) {
  const room = rooms[ws.roomName];

  if (payload.length !== 4) return;

  const xPercent = bytesToShort(payload.subarray(0, 2)) / 100;
  const yPercent = bytesToShort(payload.subarray(2, 4)) / 100;

  if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
    return;
  }

  if (!room.cursors[ws.client.uuid]) {
    room.cursors[ws.client.uuid] = {
      x: xPercent,
      y: yPercent,
      lastX: 0,
      lastY: 0,
      cid: ws.clientId,
      eventQueue: [],
      eventQueueStartTime: null,
    };
  }

  const cursor = room.cursors[ws.client.uuid];

  cursor.x = xPercent;
  cursor.y = yPercent;

  if (cursor.eventQueue.length === 0) {
    cursor.eventQueueStartTime = Date.now();
  }

  const eventTimeOffset = cursor.eventQueueStartTime
    ? Date.now() - cursor.eventQueueStartTime
    : 0;
  cursor.eventQueue.push([eventTimeOffset, xPercent, yPercent]);
}

export function setRoomSettings(ws, payload) {
  const room = rooms[ws.roomName];
  if (room.owner?.client?.uuid !== ws.client.uuid) return;

  let i = 0;
  while (i < payload.length) {
    const byte = payload[i++];
    const setting = byte >> 1;
    const value = byte & 1;

    if (value !== 0 && value !== 1) {
      return; // invalid value
    }

    switch (setting) {
      case 1: {
        room.hidden = value === 1;
        break;
      }
      case 2: {
        room.chatFilter = value === 1;
        break;
      }
      case 3: {
        room.disableChat = value === 1;
        break;
      }
      case 4: {
        room.disablePiano = value === 1;
        break;
      }
    }
  }

  broadcastToRoom(ws, new Uint8Array([OPCODE.ROOM_SETTINGS, ...payload]), true);
  ws.send(new Uint8Array([OPCODE.ROOM_SETTINGS, ...payload]));

  broadcastRoomList();
}
