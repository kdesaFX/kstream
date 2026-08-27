import { createClient } from "jsr:@supabase/supabase-js@2";

const APPLICATION_ID = "1536251834203770941";
const DEFAULT_PUBLIC_KEY =
  "cb8edf355b81013b7f84bb228a5df074a5253b2680f42f8ccbbc661b434fc1a5";

export type BotEnv = {
  token: string;
  publicKey: string;
  applicationId: string;
  guildId: string;
  ticketCategoryId?: string;
  updatesChannelId?: string;
  welcomeChannelId?: string;
  rulesChannelId?: string;
  supportChannelId?: string;
  staffRoleId?: string;
};

const KEYS = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_APPLICATION_ID",
  "DISCORD_GUILD_ID",
  "DISCORD_TICKET_CATEGORY_ID",
  "DISCORD_UPDATES_CHANNEL_ID",
  "DISCORD_WELCOME_CHANNEL_ID",
  "DISCORD_RULES_CHANNEL_ID",
  "DISCORD_SUPPORT_CHANNEL_ID",
  "DISCORD_STAFF_ROLE_ID",
] as const;

let cache: BotEnv | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

async function loadVaultMap(): Promise<Record<string, string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return {};

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const results = await Promise.all(
    KEYS.map(async (name) => {
      const { data } = await supabase.rpc("discord_bot_setting", {
        setting_name: name,
      });
      return [name, data ? String(data) : ""] as const;
    }),
  );

  const map: Record<string, string> = {};
  for (const [name, value] of results) {
    if (value) map[name] = value;
  }
  return map;
}

function pick(
  map: Record<string, string>,
  name: string,
  fallback?: string,
): string | undefined {
  return Deno.env.get(name) ?? map[name] ?? fallback;
}

export async function loadEnv(force = false): Promise<BotEnv> {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) {
    return cache;
  }

  const map = await loadVaultMap();
  const token = pick(map, "DISCORD_BOT_TOKEN");
  const publicKey = pick(map, "DISCORD_PUBLIC_KEY", DEFAULT_PUBLIC_KEY);

  if (!token || !publicKey) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_PUBLIC_KEY are required");
  }

  cache = {
    token,
    publicKey,
    applicationId: pick(map, "DISCORD_APPLICATION_ID") ?? APPLICATION_ID,
    guildId: pick(map, "DISCORD_GUILD_ID") ?? "",
    ticketCategoryId: pick(map, "DISCORD_TICKET_CATEGORY_ID"),
    updatesChannelId: pick(map, "DISCORD_UPDATES_CHANNEL_ID"),
    welcomeChannelId: pick(map, "DISCORD_WELCOME_CHANNEL_ID"),
    rulesChannelId: pick(map, "DISCORD_RULES_CHANNEL_ID"),
    supportChannelId: pick(map, "DISCORD_SUPPORT_CHANNEL_ID"),
    staffRoleId: pick(map, "DISCORD_STAFF_ROLE_ID"),
  };
  cacheAt = Date.now();
  return cache;
}

export async function saveVaultSetting(name: string, value: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await supabase.rpc("discord_bot_upsert_setting", {
    setting_name: name,
    setting_value: value,
  });
  cache = null;
}
