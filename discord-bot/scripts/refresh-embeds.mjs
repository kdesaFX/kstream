/**
 * Wipe bot messages in welcome/rules/support, then repost branded embeds.
 *
 *   node discord-bot/scripts/refresh-embeds.mjs YOUR_BOT_TOKEN
 */
const token = process.argv[2] || process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "1542310809898590288";
const BANNER = "https://kdesa.stream/embed-preview.png?v=8";

if (!token) {
  console.error("Need bot token");
  process.exit(1);
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`https://discord.com/api/v10${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  console.log(`Purged ${n} bot messages in ${channelId}`);
}

const BRAND = {
  accent: 0x5865f2,
  color: 0x1a1b1e,
  danger: 0xed4245,
  site: "https://kdesa.stream",
};

function banner() {
  return { color: BRAND.accent, image: { url: BANNER } };
}

function welcomeEmbeds(ids) {
  return [
    banner(),
    {
      title: "Welcome to kdesa.stream!",
      description: [
        "Your hub for streaming movies & shows, browsing manga, and getting help when something breaks.",
        "",
        "**Important Channels:**",
        `• **Rules** — <#${ids.rules}>`,
        `• **Support** — <#${ids.support}>`,
        `• **Updates** — <#${ids.updates}>`,
        "",
        `Jump in on the site anytime: **${BRAND.site}**`,
      ].join("\n"),
      color: BRAND.accent,
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
      color: BRAND.accent,
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
      color: BRAND.danger,
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
        color: BRAND.accent,
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
  const me = await api("/users/@me");
  console.log(`Bot: ${me.username} (${me.id})`);

  const channels = await api(`/guilds/${GUILD_ID}/channels`);
  const byName = (names) => channels.find((c) => names.includes(c.name));

  const rules = byName(["rules", "📜・rules", "📜-rules"]);
  const welcome = byName(["welcome", "👋・welcome", "👋-welcome"]);
  const updates = byName(["updates", "📢・updates", "📢-updates"]);
  const support = byName(["support", "🛠️・support", "🛠️-support", "🔧・support", "🔧-support"]);

  if (!rules || !welcome || !updates || !support) {
    throw new Error("Missing channels — run complete-setup first");
  }

  const ids = {
    rules: rules.id,
    welcome: welcome.id,
    updates: updates.id,
    support: support.id,
  };

  for (const [id, name] of [
    [rules.id, "📜・rules"],
    [welcome.id, "👋・welcome"],
    [updates.id, "📢・updates"],
    [support.id, "🛠️・support"],
  ]) {
    await api(`/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }).catch(() => undefined);
  }

  await purgeBotMessages(rules.id, me.id);
  await api(`/channels/${rules.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: rulesEmbeds() }),
  });
  console.log("Posted rules");

  await purgeBotMessages(welcome.id, me.id);
  await api(`/channels/${welcome.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: welcomeEmbeds(ids),
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Website", url: BRAND.site },
            { type: 2, style: 5, label: "Browse", url: `${BRAND.site}/browse` },
          ],
        },
      ],
    }),
  });
  console.log("Posted welcome");

  await purgeBotMessages(support.id, me.id);
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
