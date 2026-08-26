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

async function vaultSetting(name: string): Promise<string | undefined> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return undefined;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("discord_bot_setting", {
    setting_name: name,
  });
  if (error || !data) return undefined;
  return String(data);
}

async function setting(name: string, fallback?: string): Promise<string | undefined> {
  return Deno.env.get(name) ?? (await vaultSetting(name)) ?? fallback;
}

export async function loadEnv(): Promise<BotEnv> {
  const token = await setting("DISCORD_BOT_TOKEN");
  const publicKey = await setting("DISCORD_PUBLIC_KEY", DEFAULT_PUBLIC_KEY);

  if (!token || !publicKey) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_PUBLIC_KEY are required");
  }

  return {
    token,
    publicKey,
    applicationId: (await setting("DISCORD_APPLICATION_ID")) ?? APPLICATION_ID,
    guildId: (await setting("DISCORD_GUILD_ID")) ?? "",
    ticketCategoryId: await setting("DISCORD_TICKET_CATEGORY_ID"),
    updatesChannelId: await setting("DISCORD_UPDATES_CHANNEL_ID"),
    welcomeChannelId: await setting("DISCORD_WELCOME_CHANNEL_ID"),
    rulesChannelId: await setting("DISCORD_RULES_CHANNEL_ID"),
    supportChannelId: await setting("DISCORD_SUPPORT_CHANNEL_ID"),
    staffRoleId: await setting("DISCORD_STAFF_ROLE_ID"),
  };
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
}
