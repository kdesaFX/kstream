import { createClient } from "jsr:@supabase/supabase-js@2";
import { discordJson } from "./discord.ts";

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

const SKIP_HOSTS = new Set([
  "discord.com",
  "discord.gg",
  "discordapp.com",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "tenor.com",
  "giphy.com",
  "imgur.com",
  "i.imgur.com",
  "google.com",
  "youtu.be",
  "youtube.com",
  "twitter.com",
  "x.com",
  "t.co",
  "reddit.com",
  "redd.it",
  "github.com",
  "raw.githubusercontent.com",
  "spotify.com",
  "open.spotify.com",
  "kdesa.stream",
  "p-stream.github.io",
]);

export type LinkCategory = "streaming" | "ddl" | "tools" | "wiki" | "unknown";
export type LinkSource = "scan" | "ingest" | "import" | "live";

export type DiscoveredLink = {
  url: string;
  domain: string;
  category: LinkCategory;
  channel_id?: string;
  message_id?: string;
  label?: string;
};

type DiscordMessage = {
  id: string;
  content: string;
  embeds?: Array<{
    url?: string;
    title?: string;
    description?: string;
  }>;
};

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;!?]+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

export function classifyLink(url: string, context = ""): LinkCategory {
  const blob = `${url} ${context}`.toLowerCase();
  if (
    /debrid|rapidgator|1fichier|mega\.nz|torrent|ddl|hoster|nitroflare|uploaded\.|turbobit|katfile|fboom|keep2share|k2s\.|filefactory/i.test(
      blob,
    )
  ) {
    return "ddl";
  }
  if (
    /subtitle|subscene|opensubtitles|wyzie|stremio|trakt|jackett|prowlarr|sonarr|radarr|tools?|extension/i.test(
      blob,
    )
  ) {
    return "tools";
  }
  if (/rentry\.co|wiki|megathread|fmhy|pastebin|gist\.github/i.test(blob)) {
    return "wiki";
  }
  if (
    /stream|watch|movie|tv|anime|embed|player|flix|cine|vid|mirror|hls|m3u8|showbox|way2|nova|debridr/i.test(
      blob,
    )
  ) {
    return "streaming";
  }
  return "unknown";
}

export function shouldSkipHost(host: string): boolean {
  const h = host.toLowerCase();
  if (SKIP_HOSTS.has(h)) return true;
  if (h.endsWith(".discord.com") || h.endsWith(".discordapp.com")) return true;
  return false;
}

export function extractUrlsFromText(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    const normalized = normalizeUrl(match[0]);
    if (!normalized) continue;
    const host = hostFromUrl(normalized);
    if (shouldSkipHost(host)) continue;
    out.add(normalized);
  }
  return [...out];
}

export function extractLinksFromMessage(message: DiscordMessage): DiscoveredLink[] {
  const chunks: string[] = [];
  if (message.content) chunks.push(message.content);
  for (const embed of message.embeds ?? []) {
    if (embed.title) chunks.push(embed.title);
    if (embed.description) chunks.push(embed.description);
    if (embed.url) chunks.push(embed.url);
  }

  const context = chunks.join("\n");
  const links: DiscoveredLink[] = [];
  const seen = new Set<string>();

  for (const url of extractUrlsFromText(context)) {
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      domain: hostFromUrl(url),
      category: classifyLink(url, context),
      message_id: message.id,
    });
  }

  return links;
}

export async function fetchChannelMessages(
  token: string,
  channelId: string,
  limit: number,
): Promise<DiscordMessage[]> {
  const cap = Math.min(Math.max(limit, 50), 2000);
  const messages: DiscordMessage[] = [];
  let before: string | undefined;

  while (messages.length < cap) {
    const batchSize = Math.min(100, cap - messages.length);
    const path = `/channels/${channelId}/messages?limit=${batchSize}${
      before ? `&before=${before}` : ""
    }`;
    const batch = await discordJson<DiscordMessage[]>(token, path);
    if (!batch.length) break;
    messages.push(...batch);
    before = batch[batch.length - 1]?.id;
    if (batch.length < batchSize) break;
    await sleep(350);
  }

  return messages;
}

export async function upsertDiscoveredLinks(opts: {
  guildId: string;
  links: DiscoveredLink[];
  source: LinkSource;
  label?: string;
}): Promise<{ inserted: number; total: number }> {
  if (!opts.links.length) return { inserted: 0, total: 0 };

  const rows = opts.links.map((link) => ({
    guild_id: opts.guildId,
    channel_id: link.channel_id ?? null,
    message_id: link.message_id ?? null,
    label: link.label ?? opts.label ?? null,
    url: link.url,
    domain: link.domain,
    category: link.category,
    source: opts.source,
  }));

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("discord_discovered_links")
    .upsert(rows, { onConflict: "guild_id,url", ignoreDuplicates: true })
    .select("id");

  if (error) throw new Error(error.message);
  return { inserted: data?.length ?? 0, total: opts.links.length };
}

export async function scanChannelForLinks(
  token: string,
  guildId: string,
  channelId: string,
  limit: number,
): Promise<{ messages: number; links: number; inserted: number; topDomains: string[] }> {
  const messages = await fetchChannelMessages(token, channelId, limit);
  const all: DiscoveredLink[] = [];
  const domainCounts = new Map<string, number>();

  for (const message of messages) {
    for (const link of extractLinksFromMessage(message)) {
      link.channel_id = channelId;
      all.push(link);
      domainCounts.set(link.domain, (domainCounts.get(link.domain) ?? 0) + 1);
    }
  }

  const unique = new Map<string, DiscoveredLink>();
  for (const link of all) unique.set(link.url, link);

  const { inserted } = await upsertDiscoveredLinks({
    guildId,
    links: [...unique.values()],
    source: "scan",
  });

  const topDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => `${domain} (${count})`);

  return {
    messages: messages.length,
    links: unique.size,
    inserted,
    topDomains,
  };
}

export async function listRecentLinks(opts: {
  guildId?: string;
  domain?: string;
  limit?: number;
}): Promise<
  Array<{
    url: string;
    domain: string;
    category: string;
    label: string | null;
    discovered_at: string;
  }>
> {
  const supabase = supabaseAdmin();
  let query = supabase
    .from("discord_discovered_links")
    .select("url, domain, category, label, discovered_at")
    .order("discovered_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 15, 25));

  if (opts.guildId) query = query.eq("guild_id", opts.guildId);
  if (opts.domain) query = query.ilike("domain", `%${opts.domain}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
