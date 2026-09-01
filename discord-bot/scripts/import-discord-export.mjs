#!/usr/bin/env node
/**
 * Import URLs from a Discord "Request your data" export into discord_discovered_links.
 * Use this for servers like FMHY where the bot cannot be invited — your export
 * includes messages from channels you can read.
 *
 * Usage:
 *   node discord-bot/scripts/import-discord-export.mjs "C:/Users/you/Downloads/discord-export"
 *   node discord-bot/scripts/import-discord-export.mjs ./export --label fmhy-project-updates
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const exportRoot = process.argv[2];
const label =
  process.argv.includes("--label")
    ? process.argv[process.argv.indexOf("--label") + 1]
    : "discord-export";
const guildId =
  process.argv.includes("--guild")
    ? process.argv[process.argv.indexOf("--guild") + 1]
    : "fmhy-import";

if (!exportRoot) {
  console.error(
    "Usage: node discord-bot/scripts/import-discord-export.mjs <export-folder> [--label name] [--guild id]",
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;
const SKIP = new Set([
  "discord.com",
  "discord.gg",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "tenor.com",
  "giphy.com",
  "youtu.be",
  "youtube.com",
  "twitter.com",
  "x.com",
  "reddit.com",
]);

function normalize(raw) {
  const trimmed = raw.trim().replace(/[),.;!?]+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostFrom(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function classify(url, context = "") {
  const blob = `${url} ${context}`.toLowerCase();
  if (/debrid|rapidgator|torrent|ddl|mega\.nz/i.test(blob)) return "ddl";
  if (/subtitle|stremio|trakt|tools?/i.test(blob)) return "tools";
  if (/rentry|wiki|fmhy|megathread/i.test(blob)) return "wiki";
  if (/stream|watch|movie|tv|anime|embed|player|flix|cine|vid/i.test(blob)) {
    return "streaming";
  }
  return "unknown";
}

function extractFromText(text) {
  const out = new Set();
  for (const m of text.matchAll(URL_RE)) {
    const normalized = normalize(m[0]);
    if (!normalized) continue;
    const host = hostFrom(normalized);
    if (SKIP.has(host)) continue;
    out.add(normalized);
  }
  return [...out];
}

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonFiles(full, acc);
    else if (entry.name.endsWith(".json")) acc.push(full);
  }
  return acc;
}

function messagesFromFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(raw)) return raw;
    if (raw?.messages && Array.isArray(raw.messages)) return raw.messages;
    if (raw?.content) return [raw];
    return [];
  } catch {
    return [];
  }
}

const messagesDir = [
  path.join(exportRoot, "Messages"),
  path.join(exportRoot, "messages"),
  exportRoot,
].find((p) => fs.existsSync(p));

if (!messagesDir) {
  console.error("Could not find Messages/ folder in export");
  process.exit(1);
}

const files = walkJsonFiles(messagesDir);
const linkMap = new Map();
let messageCount = 0;

for (const file of files) {
  for (const message of messagesFromFile(file)) {
    messageCount += 1;
    let text = [message.Content, message.content, message.body]
      .filter(Boolean)
      .join("\n");
    const embeds = message.Embeds ?? message.embeds ?? [];
    for (const embed of embeds) {
      const parts = [
        embed.url,
        embed.title,
        embed.description,
        embed.Url,
        embed.Title,
        embed.Description,
      ].filter(Boolean);
      text += `\n${parts.join("\n")}`;
    }
    for (const foundUrl of extractFromText(text)) {
      if (!linkMap.has(foundUrl)) {
        linkMap.set(foundUrl, {
          guild_id: guildId,
          label,
          url: foundUrl,
          domain: hostFrom(foundUrl),
          category: classify(foundUrl, text),
          source: "import",
        });
      }
    }
  }
}

const rows = [...linkMap.values()];
if (!rows.length) {
  console.error("No links found in export");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase
  .from("discord_discovered_links")
  .upsert(rows, { onConflict: "guild_id,url", ignoreDuplicates: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

const outPath = path.join(__dirname, "..", "..", "scripts", "discord-links-export.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      importedAt: new Date().toISOString(),
      label,
      guildId,
      messageFiles: files.length,
      messagesScanned: messageCount,
      uniqueLinks: rows.length,
      links: rows,
    },
    null,
    2,
  ),
);

console.log(
  `Imported ${rows.length} unique links from ${messageCount} messages (${files.length} json files)`,
);
console.log(`Wrote ${outPath}`);
