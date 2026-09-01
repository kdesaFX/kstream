/**
 * Register guild slash commands for the kstream Discord bot.
 *
 * Usage (from repo root):
 *   node discord-bot/scripts/register-commands.mjs [guild_id]
 *   (reads token from discord-bot/.env)
 */

import "./load-env.mjs";

const APPLICATION_ID = "1536251834203770941";
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.argv[2] || process.env.DISCORD_GUILD_ID;

if (!token) {
  console.error("Set DISCORD_BOT_TOKEN");
  process.exit(1);
}

const commands = [
  {
    name: "ticket",
    description: "Open a private support ticket",
    options: [
      {
        name: "subject",
        description: "Short summary of your issue",
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: "ticket-close",
    description: "Close the current ticket channel",
  },
  {
    name: "update",
    description: "Post a site update embed (staff only, no ping)",
    options: [
      {
        name: "title",
        description: "Update title",
        type: 3,
        required: true,
      },
      {
        name: "description",
        description: "Update body (supports markdown)",
        type: 3,
        required: true,
      },
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
  {
    name: "setup-server",
    description: "Create rules, welcome, updates, support channels (admin)",
  },
  {
    name: "scan-channel",
    description: "Index streaming/source links from a channel (staff)",
    options: [
      {
        name: "channel",
        description: "Channel to scan (defaults to current)",
        type: 7,
        required: false,
      },
      {
        name: "limit",
        description: "Max messages to read (50–2000, default 500)",
        type: 4,
        required: false,
        min_value: 50,
        max_value: 2000,
      },
    ],
  },
  {
    name: "scan-server",
    description: "Scan up to 12 text channels for source links (staff)",
    options: [
      {
        name: "limit",
        description: "Max messages per channel (default 300)",
        type: 4,
        required: false,
        min_value: 50,
        max_value: 1000,
      },
    ],
  },
  {
    name: "source-links",
    description: "Show recently indexed source links (staff)",
    options: [
      {
        name: "domain",
        description: "Filter by domain substring",
        type: 3,
        required: false,
      },
      {
        name: "limit",
        description: "How many links (5–25, default 15)",
        type: 4,
        required: false,
        min_value: 5,
        max_value: 25,
      },
    ],
  },
  {
    name: "ingest-links",
    description: "Paste URLs from a thread (e.g. FMHY) to index (staff)",
    options: [
      {
        name: "text",
        description: "Message or thread text containing links",
        type: 3,
        required: true,
      },
      {
        name: "label",
        description: "Source label (e.g. fmhy-project-updates)",
        type: 3,
        required: false,
      },
    ],
  },
];

async function main() {
  const base = `https://discord.com/api/v10/applications/${APPLICATION_ID}`;
  const url = guildId
    ? `${base}/guilds/${guildId}/commands`
    : `${base}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Failed:", res.status, text);
    process.exit(1);
  }

  console.log("Registered commands:", JSON.parse(text).map((c) => c.name).join(", "));
}

main();
