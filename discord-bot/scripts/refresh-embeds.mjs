/**
 * Set bot profile banner + bio, then refresh channel embeds.
 * Banner is attached to each message (attachment://) so Discord always loads it.
 *
 *   node discord-bot/scripts/refresh-embeds.mjs YOUR_BOT_TOKEN
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const token = process.argv[2] || process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "1542310809898590288";
const APP_ID = "1536251834203770941";
const BIO =
  "Official kdesa.stream bot — tickets, updates, and server info. Watch movies, TV & manga at https://kdesa.stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bannerPath = path.join(__dirname, "../../public/discord-banner.jpg");
const BANNER_NAME = "discord-banner.jpg";

if (!token) {
  console.error("Need bot token");
  process.exit(1);
}

if (!fs.existsSync(bannerPath)) {
  console.error("Missing", bannerPath);
  process.exit(1);
}

async function api(pathName, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${token}`);
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`https://discord.com/api/v10${pathName}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathName} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setBotProfile() {
  const buf = fs.readFileSync(bannerPath);
  const dataUri = `data:image/jpeg;base64,${buf.toString("base64")}`;

  try {
    await api(`/applications/${APP_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ description: BIO }),
    });
    console.log("Set application description (bio)");
  } catch (err) {
    console.warn("App description:", err.message);
  }

  try {
    await api("/users/@me", {
      method: "PATCH",
      body: JSON.stringify({ banner: dataUri, bio: BIO }),
    });
    console.log("Set bot user banner + bio");
  } catch (err) {
    console.warn("Bot user profile:", err.message);
    try {
      await api("/users/@me", {
        method: "PATCH",
        body: JSON.stringify({ banner: dataUri }),
      });
      console.log("Set bot user banner only");
    } catch (err2) {
      console.warn("Bot banner failed:", err2.message);
    }
  }
}

async function purgeBotMessages(channelId, botId) {
  const messages = await api(`/channels/${channelId}/messages?limit=50`);
  let n = 0;
  for (const msg of messages) {
    if (msg.author?.id !== botId) continue;
    await api(`/channels/${channelId}/messages/${msg.id}`, { method: "DELETE" });
    n++;
    await sleep(350);
  }
  console.log(`Purged ${n} in ${channelId}`);
}

const BRAND = {
  color: 0x111214,
  site: "https://kdesa.stream",
};

/** Banner via message attachment — reliable; external URLs often break in embeds. */
function bannerEmbed() {
  return {
    color: BRAND.color,
    image: { url: `attachment://${BANNER_NAME}` },
  };
}

async function postWithBanner(channelId, payload) {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append(
    "files[0]",
    new Blob([fs.readFileSync(bannerPath)], { type: "image/jpeg" }),
    BANNER_NAME,
  );
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${token}` },
      body: form,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`post ${channelId} ${res.status}: ${text}`);
  return JSON.parse(text);
}

function welcomeEmbeds(ids) {
  return [
    bannerEmbed(),
    {
      title: "Welcome to kdesa.stream!",
      description: [
        "Your hub for streaming movies & shows, browsing manga, and getting help when something breaks.",
        "",
        "Tap **Get Signal** below to pick up the member role.",
        "",
        "**Important Channels:**",
        `• **Support** — <#${ids.support}>`,
        `• **Updates** — <#${ids.updates}>`,
        "",
        `Jump in on the site anytime: **${BRAND.site}**`,
      ].join("\n"),
      color: BRAND.color,
      footer: { text: "kdesa.stream community" },
    },
    {
      title: "Start Here",
      description: [
        "**Information**",
        "This server is for kdesa.stream support — site bugs, account help, and reports.",
        `Need help? Open a ticket in <#${ids.support}>.`,
        "",
        "**Updates**",
        `⤷ <#${ids.updates}>`,
        "Site changes and announcements (no random pings — we tell you when).",
        "",
        "**Support**",
        `⤷ <#${ids.support}>`,
        "Bugs, account issues, and reports via ticket buttons.",
      ].join("\n"),
      color: BRAND.color,
    },
  ];
}

function supportPayload(ids) {
  return {
    embeds: [
      bannerEmbed(),
      {
        title: "Contact Support",
        description: [
          "Need help with **kdesa.stream**? Open a private ticket below.",
          "",
          "**NOTE:** Tickets are for site/account issues and reports — not random chat. Misuse may get a warning.",
          "",
          `Site news lives in <#${ids.updates}>.`,
        ].join("\n"),
        color: BRAND.color,
        fields: [
          {
            name: "🛠️ General Support",
            value: "Bugs, playback issues, manga loading, account/login help.",
          },
          {
            name: "🛡️ Report",
            value: "Report a member or something that broke server guidelines.",
          },
        ],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: "Support Ticket",
            emoji: { name: "🛠️" },
            custom_id: "ticket_open_support",
          },
          {
            type: 2,
            style: 2,
            label: "Report Ticket",
            emoji: { name: "🛡️" },
            custom_id: "ticket_open_report",
          },
        ],
      },
    ],
  };
}

async function main() {
  await setBotProfile();

  const me = await api("/users/@me");
  console.log(`Bot: ${me.username} (${me.id})`);

  const channels = await api(`/guilds/${GUILD_ID}/channels`);
  const byName = (names) => channels.find((c) => names.includes(c.name));

  const welcome = byName(["welcome", "👋・welcome", "👋-welcome"]);
  const updates = byName(["updates", "📢・updates", "📢-updates"]);
  const support = byName([
    "support",
    "🛠️・support",
    "🛠️-support",
    "🔧・support",
    "🔧-support",
  ]);

  if (!welcome || !updates || !support) {
    throw new Error("Missing channels (need welcome, updates, support)");
  }

  const ids = {
    welcome: welcome.id,
    updates: updates.id,
    support: support.id,
  };

  for (const chId of [welcome.id, support.id]) {
    await purgeBotMessages(chId, me.id);
  }

  await postWithBanner(welcome.id, {
    embeds: welcomeEmbeds(ids),
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "Get Signal",
            emoji: { name: "📡" },
            custom_id: "claim_member_role",
          },
          { type: 2, style: 5, label: "Website", url: BRAND.site },
          { type: 2, style: 5, label: "Browse", url: `${BRAND.site}/browse` },
        ],
      },
    ],
  });
  console.log("Posted welcome");

  await postWithBanner(support.id, supportPayload(ids));
  console.log("Posted support");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
