import { LOOKAHEAD_MS } from "./constants.js";

const noteBuffer = [];
let serverTimeOffset = 0;
let pingMs = [];

onmessage = (e) => {
  const { type, data } = e.data;

  if (type === "addEvent") {
    noteBuffer.push(data);
  } else if (type === "setServerTimeOffset") {
    serverTimeOffset = data;
  } else if (type === "addPing") {
    pingMs.push(data);
    if (pingMs.length > 10) pingMs.shift(); // keep last 10 pings
  }
};

function processNotes() {
  if (noteBuffer.length === 0) return;

  const now = performance.now() + serverTimeOffset;
  let lookahead = LOOKAHEAD_MS;
  const averagePing =
    pingMs.length > 0
      ? Math.ceil(pingMs.reduce((a, b) => a + b, 0) / pingMs.length)
      : 0;

  const pingSteps = [
    10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000,
    5000, 10000, 15000,
  ];
  for (let i = 0; i < pingSteps.length; i++) {
    if (averagePing > pingSteps[i]) {
      const prev = i === 0 ? 0 : pingSteps[i - 1];
      lookahead += pingSteps[i] - prev;
    }
  }

  const events = noteBuffer.splice(0);
  for (const event of events) {
    let delay = event.ts - now + lookahead;

    setTimeout(
      () => {
        postMessage({ type: "playNote", data: event });
      },
      Math.max(0, delay),
    );
  }
}

setInterval(processNotes, 16);
