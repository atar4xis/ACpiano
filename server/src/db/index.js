import sqlite3 from "sqlite3";
import { DB_PATH } from "../config/constants.js";

const db = new sqlite3.Database(DB_PATH);

export async function setupDatabase() {
  await dbRun(
    `CREATE TABLE IF NOT EXISTS clients (
      uuid VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      admin INTEGER NOT NULL DEFAULT 0,
      color VARCHAR(7) NOT NULL
    )`,
  ),
    await dbRun(
      `CREATE TABLE IF NOT EXISTS messages (
      uid VARCHAR(16) PRIMARY KEY,
      client_uuid VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      color VARCHAR(7) NOT NULL,
      room_name VARCHAR(64) NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    );
}

export function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

export function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
