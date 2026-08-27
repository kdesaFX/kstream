/**
 * Set bot profile banner + bio, then refresh channel embeds.
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
const bannerPath = path.join(__dirname, "../../public/discord-banner.png");

if (!token) {
  console.error("Need bot token");
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
  const b64 = buf.toString("base64");
  const dataUri = `data:image/png;base64,${b64}`;

  try {
    await api(`/applications/${APP_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: BIO,
      }),
    });
    console.log("Set application description (bio)");
  } catch (err) {
    console.warn("App description:", err.message);
  }

  try {
    await api("/users/@me", {
      method: "PATCH",
      body: JSON.stringify({
        banner: dataUri,
        bio: BIO,
      }),
    });
    console.log("Set bot user banner + bio");
  } catch (err) {
    console.warn("Bot user profile:", err.message);
    // Fallback: banner only
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
  banner: "https://kdesa.stream/discord-banner.png?v=2",
};

function banner() {
  return { color: BRAND.color, image: { url: BRAND.banner } };
}

function welcomeEmbeds(ids) {
  return [
    banner(),
    {
      title: "Welcome to kdesa.stream!",
      description: [
        "Your hub for streaming movies & shows, browsing manga, and getting help when something breaks.",
        "",
        "Tap **Get Signal** below to pick up the member role.",
        "",
        "**Important Channels:**",
        `• **Rules** — <#${ids.rules}>`,
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
        "This server is for kdesa.stream — streaming, manga, and support.",
        `Questions about the site? Open a ticket in <#${ids.support}>.`,
        "",
        "**Rules**",
        `⤷ <#${ids.rules}>`,
        "General rules for the whole server.",
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

function rulesEmbeds() {
  return [
    banner(),
    {
      title: "kdesa.stream Rules",
      description: [
        "Follow these so the server stays chill. Staff usually start with warnings.",
        "",
        "**Warning System:**",
        "• **1st** — Warning",
        "• **2nd** — Warning",
        "• **3rd** — Warning + 1 day mute",
        "• **4th** — Warning + 3 day mute",
        "• **5th** — Warning + 3 day ban",
        "• **6th** — Warning + 14 day ban",
        "• **7th** — Permanent ban",
        "",
        "**Note:** Warns expire after **3 months** — they're not forever.",
      ].join("\n"),
      color: BRAND.color,
    },
    {
      title: "Warnable Offenses",
      description: [
        "• Be respectful — no harassment, slurs, or drama.",
        "• No spam, raids, or mass-pinging.",
        "• No self-promo / unsolicited links without staff OK.",
        "• Don't share account credentials or try to bypass site limits.",
        "• Don't ask for / share illegal download how-tos.",
        "• Keep tickets on-topic (site bugs, account help, reports).",
        "• No inappropriate reactions or NSFW content.",
        "• Don't ghost-ping or excessively tag people/roles.",
        "• Staff decisions are final — argue in a ticket, not in chat.",
      ].join("\n"),
      color: BRAND.color,
    },
  ];
}

function supportPanel(ids) {
  return {
    embeds: [
      banner(),
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
            value: "Report a member or something that broke the rules.",
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

  const rules = byName(["rules", "📜・rules", "📜-rules"]);
  const welcome = byName(["welcome", "👋・welcome", "👋-welcome"]);
  const updates = byName(["updates", "📢・updates", "📢-updates"]);
  const support = byName([
    "support",
    "🛠️・support",
    "🛠️-support",
    "🔧・support",
    "🔧-support",
  ]);

  if (!rules || !welcome || !updates || !support) {
    throw new Error("Missing channels");
  }

  const ids = {
    rules: rules.id,
    welcome: welcome.id,
    updates: updates.id,
    support: support.id,
  };

  // Prefer Discord CDN from local file so embeds update immediately (site deploy can lag).
  // Permanent site URL is still used in code for later refreshes once live.
  let bannerUrl = BRAND.banner;
  {
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({ content: "banner-host (ignore)" }),
    );
    form.append(
      "files[0]",
      new Blob([fs.readFileSync(bannerPath)], { type: "image/png" }),
      "discord-banner.png",
    );
    const hosted = await fetch(
      `https://discord.com/api/v10/channels/${welcome.id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${token}` },
        body: form,
      },
    ).then(async (r) => {
      const t = await r.text();
      if (!r.ok) throw new Error(`upload ${r.status}: ${t}`);
      return JSON.parse(t);
    });
    if (hosted.attachments?.[0]?.url) {
      bannerUrl = hosted.attachments[0].url;
      BRAND.banner = bannerUrl;
      console.log("Using Discord CDN banner for embeds (from local file)");
    }
    await api(`/channels/${welcome.id}/messages/${hosted.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  for (const chId of [rules.id, welcome.id, support.id]) {
    await purgeBotMessages(chId, me.id);
  }

  await api(`/channels/${rules.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: rulesEmbeds() }),
  });
  console.log("Posted rules");

  await api(`/channels/${welcome.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
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
    }),
  });
  console.log("Posted welcome");

  await api(`/channels/${support.id}/messages`, {
    method: "POST",
    body: JSON.stringify(supportPanel(ids)),
  });
  console.log("Posted support");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
