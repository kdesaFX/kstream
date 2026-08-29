/**
 * Keep the bot online with a custom status (like desktop Discord users).
 * Presence only sticks while this process stays connected to Gateway.
 *
 *   node discord-bot/scripts/set-bot-presence.mjs YOUR_BOT_TOKEN
 *   node discord-bot/scripts/set-bot-presence.mjs --once YOUR_BOT_TOKEN  # set + exit (testing)
 */
import {
  BOT_CUSTOM_STATUS,
  BOT_CUSTOM_STATUS_EMOJI,
} from "./profile.mjs";

const args = process.argv.slice(2);
const once = args.includes("--once");
const token = args.find((a) => !a.startsWith("-")) || process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Need bot token");
  process.exit(1);
}

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const INTENTS = 1 << 0; // GUILDS — enough for presence

let ws;
let heartbeatMs = 41250;
let heartbeatTimer;
let seq = null;
let identified = false;

function send(payload) {
  ws.send(JSON.stringify(payload));
}

function setPresence() {
  send({
    op: 3,
    d: {
      since: Date.now(),
      activities: [{
        name: "Custom Status",
        type: 4,
        state: BOT_CUSTOM_STATUS,
        emoji: BOT_CUSTOM_STATUS_EMOJI,
      }],
      status: "online",
      afk: false,
    },
  });
  console.log(`Custom status: ${BOT_CUSTOM_STATUS_EMOJI.name} ${BOT_CUSTOM_STATUS}`);
}

function startHeartbeat(interval) {
  clearInterval(heartbeatTimer);
  heartbeatMs = interval;
  heartbeatTimer = setInterval(() => {
    send({ op: 1, d: seq });
  }, heartbeatMs);
}

function identify() {
  send({
    op: 2,
    d: {
      token,
      intents: INTENTS,
      properties: {
        os: "linux",
        browser: "kstream-bot",
        device: "kstream-bot",
      },
    },
  });
}

async function connect() {
  const res = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gateway/bot ${res.status}: ${text}`);
  }

  ws = new WebSocket(GATEWAY);

  ws.addEventListener("open", () => {
    console.log("Gateway connected");
  });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.s != null) seq = msg.s;

    switch (msg.op) {
      case 10: // Hello
        startHeartbeat(msg.d.heartbeat_interval);
        identify();
        break;
      case 11: // Heartbeat ACK
        break;
      case 0: // Dispatch
        if (msg.t === "READY") {
          identified = true;
          console.log(`Ready as ${msg.d.user.username}`);
          setPresence();
          if (once) {
            console.log("--once: disconnecting");
            ws.close();
            process.exit(0);
          }
        }
        if (msg.t === "RESUMED") {
          setPresence();
        }
        break;
      case 7: // Reconnect
        ws.close();
        break;
      case 9: // Invalid session
        identified = false;
        setTimeout(connect, 5000);
        break;
      default:
        break;
    }
  });

  ws.addEventListener("close", (ev) => {
    clearInterval(heartbeatTimer);
    console.warn(`Gateway closed (${ev.code})`);
    if (!once && identified) {
      console.log("Reconnecting in 5s…");
      setTimeout(connect, 5000);
    }
  });

  ws.addEventListener("error", (err) => {
    console.error("Gateway error:", err.message || err);
  });
}

process.on("SIGINT", () => {
  clearInterval(heartbeatTimer);
  ws?.close();
  process.exit(0);
});

connect().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
