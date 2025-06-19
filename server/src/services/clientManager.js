import { getClientFromDb, saveClientToDb } from "../db/client.js";
import { newClient, wrapClient } from "../utils/client.js";
import { hashIP, rateLimit } from "../utils/security.js";
import { safeClose } from "../utils/network.js";
import { concurrentConnections } from "../state/security.js";
import {
  ALLOWED_ORIGINS,
  TEST_COOKIE,
  OPCODE,
  RATE_LIMIT_SETTINGS,
} from "../config/constants.js";
import { updateClientNameInDb } from "../db/client.js";
import { broadcastToRoom } from "../utils/network.js";
import { broadcastRoomList, sendRoomList } from "./roomManager.js";

export async function handleConnection(ws) {
  let origin = ws.data.origin;

  if (
    ALLOWED_ORIGINS.length > 0 &&
    (!origin || !ALLOWED_ORIGINS.includes(origin))
  ) {
    console.log(
      `Connection from ${ws.data.ip} rejected due to invalid origin: ${origin}`,
    );
    safeClose(ws, 1000);
    return;
  }

  let isTesting = ws.data.cookie && ws.data.cookie.includes(TEST_COOKIE);
  let testIP = isTesting
    ? ws.data.cookie.match(
        new RegExp(
          `${TEST_COOKIE}=(((25[0-5]|(2[0-4]|1\\d|[1-9]|)\\d)\\.?\\b){4})`,
        ),
      )
    : null;

  if (testIP && isTesting) ws.data.ip = testIP[1];

  const ip = ws.data.ip;
  const clientHash = hashIP(ip);
  const dbClient = await getClientFromDb(clientHash);

  ws.ip = ip;

  if (
    !rateLimit(
      ws,
      "connection",
      RATE_LIMIT_SETTINGS.CONNECTION.reqs,
      RATE_LIMIT_SETTINGS.CONNECTION.ms,
    )
  ) {
    console.log(`${ip} exceeded connection rate limit.`);
    safeClose(ws);
    return;
  }

  if (!concurrentConnections[ip]) {
    concurrentConnections[ip] = 0;
  }
  concurrentConnections[ip]++;

  if (concurrentConnections[ip] > 5) {
    console.log(
      `${ip} exceeded concurrent connection limit. (${concurrentConnections[ip]} > 5)`,
    );
    safeClose(ws);
    return;
  }

  if (!dbClient) {
    ws.client = newClient(ip);
    await saveClientToDb(ws.client);
  } else {
    // convert the plain database object into the wrapped client object
    ws.client = wrapClient(
      dbClient.uuid,
      dbClient.username,
      dbClient.admin === 1,
      dbClient.color,
    );
  }

  if (!ws.client) {
    console.error("Failed to create client for IP:", ip);
    safeClose(ws);
    return;
  }

  console.log(`${ws.client.username} (${ws.client.uuid}) connected from ${ip}`);
  sendRoomList(ws);
}

export function handleClientNameUpdate(ws, newName) {
  const alphaNumericCharCount = newName.replace(/[^a-zA-Z0-9]/g, "").length;
  if (
    newName.length === 0 ||
    newName.length > 60 ||
    alphaNumericCharCount === 0
  )
    return;

  const d = new Uint8Array([
    OPCODE.SET_NAME,
    ws.clientId,
    ...Buffer.from(newName),
  ]);

  updateClientNameInDb(ws.client.uuid, newName);
  broadcastToRoom(ws, d);
  ws.client.username = newName;
  ws.send(d);
}

export function handleClose(ws) {
  const ip = ws.data.ip;

  console.log(`${ip} disconnected.`);

  concurrentConnections[ip]--;
  if (concurrentConnections[ip] <= 0) {
    delete concurrentConnections[ip];
  }
}
