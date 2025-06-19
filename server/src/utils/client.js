import { getRandomColor } from "./colors.js";
import { hashIP } from "./security.js";
import { MAX_NOTE_QUOTA } from "../config/constants.js";
import { sendSystemMsg } from "./network.js";

export function newClient(ip) {
  return {
    uuid: hashIP(ip),
    username: "Player" + Math.floor(Math.random() * 1000),
    color: getRandomColor(),
    admin: 0,
    isAdmin: 0,
    noteQuota: MAX_NOTE_QUOTA,
  };
}

export function wrapClient(uuid, username, isAdmin, color) {
  return {
    uuid,
    username,
    color,
    isAdmin,
    noteQuota: MAX_NOTE_QUOTA,
  };
}

export function isVanished(ws) {
  return ws.client && ws.client.isAdmin && ws.client.username.startsWith("#");
}

export function noteQuotaCheck(ws) {
  if (ws.lastNotePlayed && Date.now() - ws.lastNotePlayed > 30) {
    ws.client.noteQuota += Math.floor((Date.now() - ws.lastNotePlayed) / 30);
    if (ws.client.noteQuota > MAX_NOTE_QUOTA)
      ws.client.noteQuota = MAX_NOTE_QUOTA;
  }

  if (ws.client.noteQuota <= 0) {
    if (!ws.lastQuotaWarning || Date.now() - ws.lastQuotaWarning > 5000) {
      sendSystemMsg(
        ws,
        "You're playing too many notes. Others won't hear them.",
      );
      ws.lastQuotaWarning = Date.now();
    }
    return false;
  }
  return true;
}
