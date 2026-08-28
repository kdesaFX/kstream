#!/usr/bin/env node
/**
 * Allowlist the school/filtered-network mirror for Supabase Auth redirects.
 *
 * Requires SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)
 * or: npx supabase login
 *
 * Usage: node scripts/allowlist-school-mirror-auth.mjs
 */
import { execSync } from "node:child_process";

const PROJECT_REF = "khplnaovkxvzhbimuvzn";
const MIRROR = "https://kstream.kdesabiz.workers.dev";
const EXTRA = [MIRROR, `${MIRROR}/**`];

function resolveToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  try {
    const out = execSync("npx supabase projects api-keys --project-ref " + PROJECT_REF, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Not an access token — ignore
    void out;
  } catch {
    /* no CLI session */
  }
  return null;
}

const token = resolveToken();
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens then:\n" +
      "  $env:SUPABASE_ACCESS_TOKEN='sbp_...'; node scripts/allowlist-school-mirror-auth.mjs",
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const getRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  { headers },
);
if (!getRes.ok) {
  console.error("GET auth config failed:", getRes.status, await getRes.text());
  process.exit(1);
}

const config = await getRes.json();
const existing = String(config.uri_allow_list || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const merged = [...existing];
for (const url of EXTRA) {
  if (!merged.includes(url)) merged.push(url);
}

if (merged.length === existing.length) {
  console.log("Already allowlisted:", EXTRA.join(", "));
  process.exit(0);
}

const patchRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({ uri_allow_list: merged.join(",") }),
  },
);

if (!patchRes.ok) {
  console.error("PATCH auth config failed:", patchRes.status, await patchRes.text());
  process.exit(1);
}

console.log("Updated uri_allow_list:");
for (const u of EXTRA) console.log(" +", u);
