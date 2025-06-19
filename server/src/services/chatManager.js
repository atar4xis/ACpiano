import crypto from "crypto";
import { rooms } from "../state/rooms.js";
import { MAX_CHAT_HISTORY, ADMIN_PHRASE, OPCODE } from "../config/constants.js";
import { saveMessageToDb, deleteMessageFromDb } from "../db/message.js";
import {
  updateClientAdminInDb,
  updateClientNameInDb,
  updateClientColorInDb,
} from "../db/client.js";
import { broadcastToRoom, sendSystemMsg, safeClose } from "../utils/network.js";
import { sanitizeRoomName } from "../utils/room.js";
import { isVanished } from "../utils/client.js";
import { adminPhraseUsed, setAdminPhraseUsed } from "../state/admin.js";
import { getClientFromDb as getClientDb } from "../db/client.js";
import { wrapClient } from "../utils/client.js";

export function genMessageId(room) {
  let id;
  while (!id || room.chat.some((msg) => msg[1] === id)) {
    id = crypto.randomBytes(8).toString("hex");
  }
  return id;
}

export async function handleChatMessage(ws, message) {
  const sanitized = sanitizeRoomName(message);
  if (sanitized.length === 0 || message.length > 200) {
    sendSystemMsg(ws, "Invalid message.");
    return;
  }

  if (await checkChatCommand(ws, message)) return;
  if (isVanished(ws)) return;

  if (
    ADMIN_PHRASE &&
    ADMIN_PHRASE.length > 64 &&
    message.includes(ADMIN_PHRASE)
  ) {
    if (adminPhraseUsed) {
      sendSystemMsg(ws, "Admin phrase already used.");
      return;
    }

    setAdminPhraseUsed(true);
    ws.client.isAdmin = true;
    await updateClientAdminInDb(ws.client.uuid, true);
    sendSystemMsg(ws, "You are now an admin.");
    return;
  }

  if (ws.lastMessageSent && Date.now() - ws.lastMessageSent < 500) {
    sendSystemMsg(ws, "You are sending messages too fast.");
    return;
  }

  if (rooms[ws.roomName].disableChat) return;

  const messageId = genMessageId(rooms[ws.roomName]);

  const d = new Uint8Array([
    OPCODE.SEND_CHAT,
    ws.clientId,
    ...Buffer.from(JSON.stringify([messageId, message])),
  ]);
  broadcastToRoom(ws, d);
  ws.send(d);

  rooms[ws.roomName].chat.push([
    ws.client.uuid,
    messageId,
    message,
    ws.client.color,
  ]);
  await saveMessageToDb(
    messageId,
    ws.client.uuid,
    message,
    ws.client.color,
    ws.roomName,
  );

  console.log(`[#${ws.roomName}] ${ws.client.username}: ${message}`);

  rooms[ws.roomName].chat = rooms[ws.roomName].chat.slice(-MAX_CHAT_HISTORY);

  ws.lastMessageSent = Date.now();
}

async function checkChatCommand(ws, message) {
  const args = message.split(" ");
  const cmd = args[0].toLowerCase();

  if (!ws.client.isAdmin) return false;

  switch (cmd) {
    case "/list": {
      const room = rooms[ws.roomName];
      sendSystemMsg(
        ws,
        `There ${room.clients.length === 1 ? "is" : "are"} ${room.clients.length} player${room.clients.length === 1 ? "" : "s"} in this room.`,
      );
      room.clients.forEach((c) => {
        sendSystemMsg(ws, `${c.client.username} - ${c.client.uuid}`);
      });
      return true;
    }
    case "/purge": {
      const targetUuid = args[1];

      if (!targetUuid) {
        sendSystemMsg(
          ws,
          "purge: Delete all chat messages sent by this player.",
        );
        sendSystemMsg(ws, "Usage: /purge <uuid>");
        return true;
      }

      const room = rooms[ws.roomName];
      let deletedCount = 0;

      room.chat.forEach((msg) => {
        if (msg[0] === targetUuid) {
          deletedCount++;
          const delPacket = new Uint8Array([
            OPCODE.DELETE_MESSAGE,
            ...Buffer.from(msg[1]),
          ]);
          ws.send(delPacket);
          broadcastToRoom(ws, delPacket, true);
          if (room.persistent) {
            deleteMessageFromDb(msg[1]);
          }
        }
      });
      room.chat = room.chat.filter((msg) => msg[0] !== targetUuid);

      sendSystemMsg(ws, `Deleted ${deletedCount} messages.`);
      return true;
    }
    case "/del": {
      const targetMessageId = args[1].startsWith("msg_")
        ? args[1].slice(4)
        : args[1];

      if (!targetMessageId) {
        sendSystemMsg(ws, "del: Delete a specific chat message.");
        sendSystemMsg(ws, "Usage: /del <message_id>");
        return true;
      }

      const room = rooms[ws.roomName];
      room.chat = room.chat.filter((msg) => msg[1] !== targetMessageId);
      await deleteMessageFromDb(targetMessageId);

      const delPacket = new Uint8Array([
        OPCODE.DELETE_MESSAGE,
        ...Buffer.from(targetMessageId),
      ]);
      ws.send(delPacket);
      broadcastToRoom(ws, delPacket, true);

      sendSystemMsg(ws, `Deleted message with ID ${targetMessageId}`);
      return true;
    }
    case "/vanish": {
      const vanished = isVanished(ws);

      if (vanished) {
        ws.client.username = ws.client.username.slice(1);
        sendSystemMsg(ws, "Vanished mode disabled.");
      } else {
        ws.client.username = "#" + ws.client.username;
        broadcastToRoom(
          ws,
          new Uint8Array([OPCODE.PLAYER_LEFT, ...Buffer.from(ws.client.uuid)]),
          true,
        );
        sendSystemMsg(ws, "Vanished mode enabled.");
      }

      await updateClientNameInDb(ws.client.uuid, ws.client.username);
      safeClose(ws); // force reconnect
      return true;
    }
    case "/setcolor": {
      if (args.length !== 3) {
        sendSystemMsg(ws, "setcolor: Set a player's color.");
        sendSystemMsg(ws, "Usage: /setcolor <uuid> <hex color>");
        return true;
      }

      const puid = args[1];
      const color = args[2].startsWith("#") ? args[2] : `#${args[2]}`;

      await updateClientColorInDb(puid, color);
      sendSystemMsg(ws, "Color updated. They must reconnect to see changes.");
      return true;
    }
    case "/setname": {
      if (args.length !== 3) {
        sendSystemMsg(ws, "setname: Set a player's name.");
        sendSystemMsg(ws, "Usage: /setname <uuid> <new name>");
        return true;
      }

      const puid = args[1];
      const newName = args.slice(2).join(" ").trim();

      await updateClientNameInDb(puid, newName);
      sendSystemMsg(ws, "Name updated. They must reconnect to see changes.");
      return true;
    }
  }
  return false;
}

export async function sendChatHistory(ws) {
  if (!ws.roomName || !rooms[ws.roomName]) return;

  const uuidToUsername = {};
  const chatHistory = await Promise.all(
    rooms[ws.roomName].chat.map(async (msg) => {
      if (!uuidToUsername[msg[0]]) {
        let client = await getClientDb(msg[0]);
        if (!client) {
          console.log(`Invalid client in chat history: ${msg[0]}`);
          return null;
        }

        const wrappedClient = wrapClient(
          client.uuid,
          client.username,
          client.admin,
          client.color,
        );

        if (isVanished({ client: wrappedClient })) {
          uuidToUsername[msg[0]] = wrappedClient.username.slice(1); // remove vanish prefix
        } else {
          uuidToUsername[msg[0]] = wrappedClient.username;
        }
      }
      let username = uuidToUsername[msg[0]];
      return [msg[0], msg[1], username, msg[2], msg[3]]; // [uuid, messageId, username, content, color]
    }),
  );

  ws.send(
    new Uint8Array([
      OPCODE.CHAT_HISTORY,
      ...Buffer.from(JSON.stringify(chatHistory)),
    ]),
  );
}
