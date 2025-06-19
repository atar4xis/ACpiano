import { dbGet, dbRun } from "./index.js";

export async function getClientFromDb(uuid) {
  return await dbGet(`SELECT * FROM clients WHERE uuid = ?`, [uuid]);
}

export async function saveClientToDb(client) {
  const { uuid, username, color, admin } = client;
  await dbRun(
    `INSERT OR REPLACE INTO clients (uuid, username, color, admin) VALUES (?, ?, ?, ?)`,
    [uuid, username, color, admin ? 1 : 0],
  );
}

export async function updateClientNameInDb(uuid, newName) {
  await dbRun(`UPDATE clients SET username = ? WHERE uuid = ?`, [
    newName,
    uuid,
  ]);
}

export async function updateClientColorInDb(uuid, newColor) {
  await dbRun(`UPDATE clients SET color = ? WHERE uuid = ?`, [newColor, uuid]);
}

export async function updateClientAdminInDb(uuid, isAdmin) {
  await dbRun(`UPDATE clients SET admin = ? WHERE uuid = ?`, [
    isAdmin ? 1 : 0,
    uuid,
  ]);
}
