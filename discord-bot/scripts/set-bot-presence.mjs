/**
 * Keep the bot online (custom status) and assign **Member** when someone joins.
 *
 * Requires Developer Portal → Bot → Privileged Gateway Intents →
 *   **Server Members Intent** ON
 *
 *   node discord-bot/scripts/set-bot-presence.mjs
 *   (reads token from discord-bot/.env — never commit that file)
 *
 * Role id is optional — looks up roles named Member (or legacy Signal) if omitted.
 */
import "./load-env.mjs";
import {
  BOT_CUSTOM_STATUS,
  BOT_CUSTOM_STATUS_EMOJI,
} from "./profile.mjs";

const args = process.argv.slice(2);
const once = args.includes("--once");
const token = args.find((a) => !a.startsWith("-")) || process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Need bot token in discord-bot/.env (DISCORD_BOT_TOKEN=…)");
  process.exit(1);
}

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const API = "https://discord.com/api/v10";
/** GUILDS | GUILD_MEMBERS — Members intent is required for join events. */
const INTENTS = (1 << 0) | (1 << 1);

const MEMBER_NAMES = ["Member", "Signal"];

let ws;
let heartbeatMs = 41250;
let heartbeatTimer;
let seq = null;
let identified = false;
/** @type {Map<string, string>} guildId → memberRoleId */
const memberRoleByGuild = new Map();

function send(payload) {
  ws.send(JSON.stringify(payload));
}

async function discordJson(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bot ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

async function resolveMemberRoleId(guildId) {
  if (memberRoleByGuild.has(guildId)) return memberRoleByGuild.get(guildId);

  const envRole = process.env.DISCORD_MEMBER_ROLE_ID;
  const envGuild = process.env.DISCORD_GUILD_ID;
  if (envRole && (!envGuild || envGuild === guildId)) {
    memberRoleByGuild.set(guildId, envRole);
    return envRole;
  }

  const roles = await discordJson(`/guilds/${guildId}/roles`);
  const found = roles.find((r) => MEMBER_NAMES.includes(r.name));
  if (!found) {
    console.warn(
      `No Member/Signal role in guild ${guildId} — run /setup-server first`,
    );
    return null;
  }

  if (found.name === "Signal") {
    try {
      await discordJson(`/guilds/${guildId}/roles/${found.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Member",
          permissions: "0",
          mentionable: false,
        }),
      });
      console.log(`Renamed legacy Signal → Member (${found.id})`);
    } catch (err) {
      console.warn("Could not rename Signal → Member:", err.message || err);
    }
  } else if (found.permissions && found.permissions !== "0") {
    try {
      await discordJson(`/guilds/${guildId}/roles/${found.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: "0" }),
      });
    } catch {
      /* ignore */
    }
  }

  memberRoleByGuild.set(guildId, found.id);
  return found.id;
}

async function assignMemberRole(guildId, userId) {
  try {
    const roleId = await resolveMemberRoleId(guildId);
    if (!roleId) return;
    await discordJson(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: "PUT",
    });
    console.log(`Granted Member to ${userId} in ${guildId}`);
  } catch (err) {
    console.error(
      `Failed to grant Member to ${userId}:`,
      err.message || err,
      "(Is the bot role above Member? Manage Roles enabled?)",
    );
  }
}

function setPresence() {
  send({
    op: 3,
    d: {
      since: Date.now(),
      activities: [
        {
          name: "Custom Status",
          type: 4,
          state: BOT_CUSTOM_STATUS,
          emoji: BOT_CUSTOM_STATUS_EMOJI,
        },
      ],
      status: "online",
      afk: false,
    },
  });
  console.log(
    `Custom status: ${BOT_CUSTOM_STATUS_EMOJI.name} ${BOT_CUSTOM_STATUS}`,
  );
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
  const res = await fetch(`${API}/gateway/bot`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gateway/bot ${res.status}: ${text}`);
  }

  ws = new WebSocket(GATEWAY);

  ws.addEventListener("open", () => {
    console.log("Gateway connected (presence + Member on join)");
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
        if (msg.t === "GUILD_MEMBER_ADD") {
          const guildId = msg.d.guild_id;
          const userId = msg.d.user?.id;
          if (guildId && userId && !msg.d.user?.bot) {
            void assignMemberRole(guildId, userId);
          }
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
    if (ev.code === 4014) {
      console.error(
        "Disallowed intents (4014). Enable Server Members Intent in the Discord Developer Portal → Bot.",
      );
      process.exit(1);
    }
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
