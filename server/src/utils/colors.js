import { ALLOWED_COLORS } from "../config/constants.js";

export function getRandomColor() {
  return ALLOWED_COLORS[Math.floor(Math.random() * ALLOWED_COLORS.length)];
}
