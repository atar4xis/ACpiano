import { config as dotEnvSetup } from "dotenv";

dotEnvSetup();

export const PORT = process.env.PORT || 8080;
export const ADMIN_PHRASE = process.env.ADMIN_PHRASE || null;
export const MAX_PLAYERS_PER_ROOM = 10;
export const MAX_NOTE_QUOTA = 100;
export const MAX_CHAT_HISTORY = 55;
export const DEFAULT_ROOM_NAME = "lobby";
export const SYSTEM_CLIENT_ID = 255;
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];
export const DB_PATH = process.env.DB_PATH || "piano.db";
export const SALT_ONE = process.env.SALT_ONE;
export const SALT_TWO = process.env.SALT_TWO;
export const TEST_COOKIE = process.env.TEST_COOKIE;

// bidirectional unless specified otherwise
export const OPCODE = {
  JOIN_ROOM: 1, // Client -> Server
  JOINED_ROOM: 1, // Server -> Client
  PLAYER_JOINED: 2, // S -> C
  PLAYER_LEFT: 3, // S -> C
  SET_CURSOR_POS: 3, // C -> S
  CURSOR_UPDATE: 4, // S -> C
  PRESS_NOTE: 5,
  RELEASE_NOTE: 6,
  BATCH_NOTES: 7,
  SEND_CHAT: 8,
  CHAT_HISTORY: 9, // S -> C
  ROOM_LIST: 10, // S -> C
  SET_NAME: 11,
  UPDATE_ROOM_SETTINGS: 12, // C -> S
  DELETE_MESSAGE: 12, // S -> C
  OWNERSHIP_TRANSFER: 13, // S -> C
  ROOM_SETTINGS: 14, // S -> C
  PING: 99, // C -> S
  PONG: 99, // S -> C
  RATE_LIMITED: 250, // S -> C
};

export const RATE_LIMIT_SETTINGS = {
  CONNECTION: { reqs: 5, ms: 1000 },
  JOIN_ROOM: { reqs: 1, ms: 500 },
  SET_CURSOR_POS: { reqs: 200, ms: 1000 },
  PLAY_NOTE: { reqs: 2000, ms: 1000 },
  RELEASE_NOTE: { reqs: 2000, ms: 1000 },
  BATCH_NOTES: { reqs: 100, ms: 1000 },
  SEND_CHAT: { reqs: 50, ms: 1000 },
  SET_NAME: { reqs: 1, ms: 1000 },
  SET_ROOM_SETTINGS: { reqs: 1, ms: 1000 },
  PING_PONG: { reqs: 10, ms: 1000 },
};

export const ALLOWED_COLORS = [
  "#f23d3d", // red
  "#f27c3d", // orange
  "#f2c83d", // yellow
  "#70f23d", // green
  "#3deff2", // cyan
  "#3d5bf2", // blue
  "#733df2", // purple
  "#d43df2", // magenta
  "#f23d82", // hot pink
  "#542c13", // brown
  "#541313", // dark red
  "#1f5413", // dark green
  "#ffef8a", // banana
  "#8b4513", // saddle brown (distinct dark brown)
  "#228b22", // forest green (deep green)
  "#ff4500", // orange red (bright red-orange)
  "#20b2aa", // light sea green (blue-green)
  "#6a5acd", // slate blue (muted purple-blue)
  "#c71585", // medium violet red (strong pink-purple)
  "#bdb76b", // dark khaki (muted yellow-green)
  "#4682b4", // steel blue (medium blue)
  "#2f4f4f", // dark slate gray (dark gray-green)
  "#ff69b4", // hot pink (bright pink, different hue)
  "#71e3b0", // turquoise
  "#94daff", // pearl blue
  "#d8bfd8", // thistle
  "#d2b48c", // tan
  "#f23d3d", // red
  "#f27c3d", // orange
  "#f2c83d", // yellow
  "#70f23d", // green
  "#3deff2", // cyan
  "#556b2f", // dark olive green
  "#8fbc8f", // dark sea green
  "#b22222", // firebrick (dark red)
  "#ff6347", // tomato (red-orange)
  "#7b68ee", // medium slate blue
  "#ffb6c1", // light pink
  "#483d8b", // dark slate blue
  "#6495ed", // cornflower blue
  "#00ced1", // dark turquoise
  "#9acd32", // yellow green
  "#ffd700", // gold
  "#3d5bf2", // blue
  "#733df2", // purple
  "#d43df2", // magenta
  "#f23d82", // hot pink
  "#133554", // dark blue
  "#135452", // dark cyan
  "#411354", // dark purple
  "#999999", // gray
  "#f0f0f0", // white (almost)
  "#1f1f1f", // black (almost)
];
