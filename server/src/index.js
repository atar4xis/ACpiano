import { PORT, DEFAULT_ROOM_NAME } from "./config/constants.js";
import { setupDatabase } from "./db/index.js";
import { handleConnection, handleClose } from "./services/clientManager.js";
import { handleMessage } from "./handlers/websocketHandlers.js";
import { createRoom, leaveRoom } from "./services/roomManager.js";
import { genMessageId } from "./services/chatManager.js";
import { getClientFromDb, saveClientToDb } from "./db/client.js";
import { rooms } from "./state/rooms.js";
import { getRandomColor } from "./utils/colors.js";
import { wrapClient } from "./utils/client.js";

// start websocket server
Bun.serve({
  port: PORT,
  fetch: (req, server) => {
    if (
      server.upgrade(req, {
        data: {
          ip:
            req.headers.get("x-forwarded-for") || server.requestIP(req).address,
          origin: req.headers.get("origin"),
          cookie: req.headers.get("cookie"),
        },
      })
    ) {
      return;
    }
    return new Response("Upgrade failed", { status: 400 });
  },
  websocket: {
    open: handleConnection,
    message: handleMessage,
    close: (ws) => {
      leaveRoom(ws);
      handleClose(ws);
    },
    error: console.error,
    maxPayloadLength: 8192,
  },
});

console.log(`Server is running on port ${PORT}`);

setupDatabase().then(() => {
  // create the lobby room
  createRoom(DEFAULT_ROOM_NAME, null, true);

  // create test room and users
  (async function createTestRoom() {
    createRoom("test", null);
    rooms["test"].hidden = true;

    for (let i = 1; i <= 8; i++) {
      let c = await getClientFromDb(`test-user-${i}`);
      if (!c) {
        c = wrapClient(
          `test-user-${i}`,
          `Test User ${i}`,
          false,
          getRandomColor(),
        );
        saveClientToDb(c);
      }
      const testClient = {
        send: () => {},
        clientId: i,
        client: c,
      };
      rooms["test"].clients.push(testClient);
      rooms["test"].cursors[`test-user-${i}`] = {
        x: Math.random() * 100,
        y: Math.random() * 100,
        lastX: 0,
        lastY: 0,
      };
      const cursor = rooms["test"].cursors[`test-user-${i}`];
      cursor.cid = i;
      cursor.lastX = cursor.x;
      cursor.lastY = cursor.y;

      rooms["test"].chat.push([
        testClient.client.uuid,
        genMessageId(rooms["test"]),
        "this is a test room and i am a test user #" + i,
        testClient.client.color,
      ]);
    }
    const firstTestClient = rooms["test"].clients[0];
    rooms["test"].owner = firstTestClient;
    rooms["test"].chat.push([
      firstTestClient.client.uuid,
      genMessageId(rooms["test"]),
      "if you accidentally found this room that's pretty funny",
      firstTestClient.client.color,
    ]);
  })();
});
