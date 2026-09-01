#!/usr/bin/env node
/**
 * Export indexed Discord source links from Supabase for source-hunt / Cursor review.
 *
 * Usage:
 *   node discord-bot/scripts/export-discord-links.mjs
 *   node discord-bot/scripts/export-discord-links.mjs --category streaming
 *   node discord-bot/scripts/export-discord-links.mjs --guild fmhy-import
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in discord-bot/.env or env.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const category = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;
const guild = args.includes("--guild")
  ? args[args.indexOf("--guild") + 1]
  : null;

const supabase = createClient(url, key, { auth: { persistSession: false } });

let query = supabase
  .from("discord_discovered_links")
  .select("url, domain, category, label, guild_id, discovered_at")
  .order("discovered_at", { ascending: false })
  .limit(5000);

if (category) query = query.eq("category", category);
if (guild) query = query.eq("guild_id", guild);

const { data, error } = await query;
if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data ?? [];
const byDomain = new Map();
for (const row of rows) {
  if (!byDomain.has(row.domain)) byDomain.set(row.domain, []);
  byDomain.get(row.domain).push(row);
}

const candidates = [...byDomain.entries()].map(([domain, links]) => ({
  id: domain.replace(/\./g, "-"),
  domain,
  urls: [...new Set(links.map((l) => l.url))],
  category: links[0]?.category ?? "unknown",
  labels: [...new Set(links.map((l) => l.label).filter(Boolean))],
  count: links.length,
}));

const outPath = path.join(__dirname, "..", "..", "scripts", "discord-links-export.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      totalLinks: rows.length,
      uniqueDomains: candidates.length,
      candidates,
      links: rows,
    },
    null,
    2,
  ),
);

console.log(`Wrote ${rows.length} links (${candidates.length} domains) → ${outPath}`);
console.log("Top domains:");
for (const c of candidates.slice(0, 15)) {
  console.log(`  ${c.domain} (${c.count}) [${c.category}]`);
}
