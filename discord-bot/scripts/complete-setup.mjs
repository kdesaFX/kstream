/**
 * One-shot Discord + Supabase bot setup.
 *
 * Usage:
 *   node discord-bot/scripts/complete-setup.mjs [bot_token] [guild_id]
 *
 * Env fallbacks: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const APPLICATION_ID = "1536251834203770941";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const INTERACTIONS_URL =
  "https://khplnaovkxvzhbimuvzn.supabase.co/functions/v1/discord-bot";

const token = process.argv[2] || process.env.DISCORD_BOT_TOKEN;
const guildIdArg = process.argv[3] || process.env.DISCORD_GUILD_ID;

async function discordApi(token, path, init = {}) {
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

async function supabaseRpc(fn, args) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Skip vault: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    return null;
  }
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const commands = [
  {
    name: "ticket",
    description: "Open a private support ticket",
    options: [{
      name: "subject",
      description: "Short summary of your issue",
      type: 3,
      required: false,
    }],
  },
  { name: "ticket-close", description: "Close the current ticket channel" },
  {
    name: "update",
    description: "Post a site update embed (staff only, no ping)",
    options: [
      { name: "title", description: "Update title", type: 3, required: true },
      { name: "description", description: "Update body", type: 3, required: true },
      {
        name: "type",
        description: "Embed style",
        type: 3,
        required: false,
        choices: [
          { name: "Small update", value: "small" },
          { name: "Big update", value: "big" },
        ],
      },
    ],
  },
  { name: "setup-server", description: "Create rules, welcome, updates, support channels (admin)" },
];

async function runServerSetup(token, guildId) {
  const existing = await discordApi(token, `/guilds/${guildId}/channels`);
  const find = (name) => existing.find((c) => c.name === name)?.id;

  let rulesId = find("rules");
  let welcomeId = find("welcome");
  let updatesId = find("updates");
  let supportId = find("support");
  let ticketCategoryId = existing.find((c) => c.name === "Support Tickets" && c.type === 4)?.id;

  const rulesEmbed = {
    title: "Server rules",
    description: [
      "1. Be respectful — no harassment, slurs, or drama.",
      "2. No spam, self-promo, or unsolicited links.",
      "3. Don't share illegal streams, leaks, or piracy how-tos.",
      "4. Support tickets are for site/account issues — keep them on-topic.",
      "5. Staff decisions are final.",
    ].join("\n"),
    color: 0xed4245,
  };

  if (!rulesId) {
    const ch = await discordApi(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "rules", type: 0, topic: "Server rules" }),
    });
    rulesId = ch.id;
    await discordApi(token, `/channels/${rulesId}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [rulesEmbed] }),
    });
  }

  if (!welcomeId) {
    const ch = await discordApi(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "welcome", type: 0, topic: "Welcome" }),
    });
    welcomeId = ch.id;
  }

  if (!updatesId) {
    const ch = await discordApi(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "updates", type: 0, topic: "kdesa.stream site updates" }),
    });
    updatesId = ch.id;
  }

  if (!supportId) {
    const ch = await discordApi(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "support", type: 0, topic: "Open a ticket with /ticket" }),
    });
    supportId = ch.id;
    await discordApi(token, `/channels/${supportId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        embeds: [{
          title: "Need help?",
          description: "Use `/ticket` anywhere in the server to open a private support channel.",
          color: 0x5865f2,
        }],
      }),
    });
  }

  if (!ticketCategoryId) {
    const cat = await discordApi(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "Support Tickets", type: 4 }),
    });
    ticketCategoryId = cat.id;
  }

  const welcomeEmbed = {
    title: "Welcome to kdesa.stream",
    description: [
      "Thanks for joining the community server.",
      "",
      `• Read the rules in <#${rulesId}>`,
      `• Site issues or account help → open a ticket in <#${supportId}>`,
      `• Site updates get posted in <#${updatesId}>`,
      "",
      "Stream, browse manga, and hang out: **https://kdesa.stream**",
    ].join("\n"),
    color: 0x5865f2,
  };

  await discordApi(token, `/channels/${welcomeId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [welcomeEmbed] }),
  });

  return { rulesId, welcomeId, updatesId, supportId, ticketCategoryId };
}

async function main() {
  if (!token) {
    console.error("Need bot token: arg or DISCORD_BOT_TOKEN");
    process.exit(1);
  }

  const me = await discordApi(token, "/users/@me");
  console.log(`Bot: ${me.username} (${me.id})`);

  try {
    await discordApi(token, `/applications/${APPLICATION_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ interactions_endpoint_url: INTERACTIONS_URL }),
    });
    console.log("Interactions endpoint set:", INTERACTIONS_URL);
  } catch (err) {
    console.warn("Could not set interactions endpoint:", err.message);
    console.warn("Set manually in Developer Portal → General → Interactions Endpoint URL");
  }

  let guildId = guildIdArg;
  if (!guildId) {
    const guilds = await discordApi(token, "/users/@me/guilds");
    if (guilds.length === 0) {
      throw new Error("Bot is not in any server. Use the invite link first.");
    }
    guildId = guilds[0].id;
    console.log(`Using guild: ${guilds[0].name} (${guildId})`);
  }

  await fetch(
    `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
  ).then(async (r) => {
    if (!r.ok) throw new Error(`register commands: ${await r.text()}`);
    console.log("Slash commands registered");
  });

  const created = await runServerSetup(token, guildId);
  console.log("Channels created:", created);

  await supabaseRpc("discord_bot_upsert_setting", { setting_name: "DISCORD_BOT_TOKEN", setting_value: token });
  await supabaseRpc("discord_bot_upsert_setting", { setting_name: "DISCORD_GUILD_ID", setting_value: guildId });
  for (const [key, val] of [
    ["DISCORD_RULES_CHANNEL_ID", created.rulesId],
    ["DISCORD_WELCOME_CHANNEL_ID", created.welcomeId],
    ["DISCORD_UPDATES_CHANNEL_ID", created.updatesId],
    ["DISCORD_SUPPORT_CHANNEL_ID", created.supportId],
    ["DISCORD_TICKET_CATEGORY_ID", created.ticketCategoryId],
  ]) {
    await supabaseRpc("discord_bot_upsert_setting", { setting_name: key, setting_value: val });
  }

  console.log("\nDone. Bot is ready — try /ticket or /update in Discord.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
