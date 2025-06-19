import crypto from "crypto";
import { SALT_ONE, SALT_TWO, OPCODE } from "../config/constants.js";
import { rateLimits } from "../state/security.js";
import { safeClose } from "./network.js";

export function hashIP(ip) {
  const shuffledIp = ip.split(/[:.]/).reverse().join("_x_");
  const hash = crypto
    .createHash("sha256")
    .update(SALT_ONE + shuffledIp + SALT_TWO)
    .digest("hex");
  return hash;
}

export function rateLimit(ws, action, reqs, ms) {
  const key = `${ws.ip}_${action}`;
  const now = Date.now();

  if (!rateLimits[key]) {
    rateLimits[key] = [];
  }

  rateLimits[key] = rateLimits[key].filter((timestamp) => timestamp > now - ms);

  if (rateLimits[key].length >= reqs) {
    ws.send(new Uint8Array([OPCODE.RATE_LIMIT_WARNING]));
    if (!ws.rateLimitWarnings) ws.rateLimitWarnings = 1;
    ws.rateLimitWarnings++;
    if (ws.rateLimitWarnings > 3) {
      safeClose(ws);
      return false;
    }
    return false;
  }

  rateLimits[key].push(now);
  return true;
}
