import {
  SOUND_PACK,
  FADE_OUT_TIME,
  SOUND_DB_NAME,
  SOUND_STORE_NAME,
} from "./constants.js";
import { $audioOverlay } from "./dom.js";

// flag to enable/disable audio playback (e.g. user gesture required to start AudioContext)
let canPlaySound = true;

let audioCtx;
let masterGain;

export function setCanPlaySound(value) {
  canPlaySound = value;
}

export function getContext() {
  return audioCtx;
}

export async function init() {
  // create audio context and master gain node for volume control
  audioCtx = new (AudioContext || webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  masterGain.connect(audioCtx.destination);

  // set master volume from localStorage or default to 50%
  const vol = parseFloat(localStorage.getItem("piano_volume"));
  setMasterVolume(Number.isFinite(vol) ? vol : 50);

  // some browsers require a user gesture to start the AudioContext
  // there is apparently no clean way to check, so just set a timeout
  setTimeout(() => {
    if (audioCtx.state === "suspended") {
      canPlaySound = false;
      $audioOverlay.style.display = "flex";
    }
  }, 50);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOUND_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(SOUND_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedSound(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readonly");
    const store = tx.objectStore(SOUND_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cacheSound(db, key, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readwrite");
    const store = tx.objectStore(SOUND_STORE_NAME);
    store.put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteCachedSound(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE_NAME, "readwrite");
    const store = tx.objectStore(SOUND_STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSound(note) {
  if (!audioCtx) return null;

  const key = `${SOUND_PACK}_${note}`;
  const db = await openDB();
  const cached = await getCachedSound(db, key);

  if (cached) {
    try {
      return await audioCtx.decodeAudioData(cached);
    } catch (e) {
      console.warn(`Failed to decode cached sound for ${note}:`, e);
      await deleteCachedSound(db, key);
      return await loadSound(note); // try to load it again
    }
  }

  const response = await fetch(`sounds/${SOUND_PACK}/${note}.mp3`);
  const arrayBuffer = await response.arrayBuffer();
  await cacheSound(db, key, arrayBuffer);
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn(`Failed to decode sound for ${note}:`, e);
    return null;
  }
}

export function playKey(key, color = "gray", velocity = 1) {
  if (!canPlaySound) return;
  if (!key?.sound) return;

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();

  source.buffer = key.sound;
  source.connect(gainNode);
  gainNode.connect(masterGain);
  gainNode.gain.setValueAtTime(velocity, audioCtx.currentTime);
  source.start(0);

  key.playings.unshift({ source, gainNode, velocity });

  key.blips.push({ color, time: Date.now() });
}

export function fadeOutKey(key, allPlayings) {
  if (!canPlaySound) return;
  try {
    const now = audioCtx.currentTime;
    const playing = key.playings[0];
    playing.gainNode.gain.linearRampToValueAtTime(playing.velocity, now);
    playing.gainNode.gain.linearRampToValueAtTime(0, now + FADE_OUT_TIME);
    playing.source.stop(now + FADE_OUT_TIME);

    if (allPlayings) {
      key.playings.forEach((p) => {
        p.gainNode.gain.linearRampToValueAtTime(p.velocity, now);
        p.gainNode.gain.linearRampToValueAtTime(0, now + FADE_OUT_TIME);
        p.source.stop(now + FADE_OUT_TIME);
      });
      key.playings = [];
    }

    key.playings = key.playings.filter((p) => p !== playing);
  } catch (_) {}
}

export function setMasterVolume(value) {
  value = value / 100;
  masterGain.gain.setValueAtTime(
    Math.max(0, Math.min(1, value)),
    audioCtx.currentTime,
  );
}

// expose some variables for external use
if (!window.ACpiano) window.ACpiano = {};
window.ACpiano.audio = {
  getContext,
  playKey,
  fadeOutKey,
  setMasterVolume,
};
