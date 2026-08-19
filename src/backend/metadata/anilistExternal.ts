import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

const ANILIST = "https://graphql.anilist.co";

export type AniListMediaType = "ANIME" | "MANGA";

export interface AniListExternalIds {
  anilistId: number;
  malId: number | null;
}

type SearchResponse = {
  data?: {
    Page?: {
      media?: Array<{ id: number; idMal?: number | null } | null> | null;
    } | null;
  } | null;
};

const gqlFetch = ofetch.create({ retry: 0, timeout: 12000 });
const cache = new Map<string, AniListExternalIds | null>();
let proxyRequired = false;

async function postGraphql(body: string): Promise<SearchResponse> {
  const init = {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  };
  const viaProxy = () => proxiedMangaUrl(ANILIST, getProxyUrls());

  if (proxyRequired) {
    const proxied = viaProxy();
    if (!proxied) throw new Error("No proxy configured for AniList requests");
    return gqlFetch<SearchResponse>(proxied, init);
  }

  try {
    return await gqlFetch<SearchResponse>(ANILIST, init);
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await gqlFetch<SearchResponse>(proxied, init);
    proxyRequired = true;
    return result;
  }
}

function cacheKey(type: AniListMediaType, title: string): string {
  return `${type}:${title.trim().toLowerCase()}`;
}

async function searchOne(
  title: string,
  type: AniListMediaType,
): Promise<AniListExternalIds | null> {
  const q = title.trim();
  if (!q) return null;
  const key = cacheKey(type, q);
  if (cache.has(key)) return cache.get(key) ?? null;

  const body = JSON.stringify({
    query: `query ($s: String, $type: MediaType) {
      Page(perPage: 1) { media(search: $s, type: $type, sort: SEARCH_MATCH) { id idMal } }
    }`,
    variables: { s: q, type },
  });
  const res = await postGraphql(body);
  const hit = res.data?.Page?.media?.[0];
  const ids = hit?.id
    ? { anilistId: hit.id, malId: hit.idMal ?? null }
    : null;
  cache.set(key, ids);
  return ids;
}

/** Resolve AniList + MyAnimeList ids from one or more title guesses. */
export async function lookupAniListExternal(
  titles: Array<string | undefined | null>,
  type: AniListMediaType,
): Promise<AniListExternalIds | null> {
  const seen = new Set<string>();
  for (const raw of titles) {
    const title = raw?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ids = await searchOne(title, type).catch(() => null);
    if (ids) return ids;
  }
  return null;
}

export function anilistPageUrl(
  type: AniListMediaType,
  anilistId: number,
): string {
  const kind = type === "ANIME" ? "anime" : "manga";
  return `https://anilist.co/${kind}/${anilistId}`;
}

export function malPageUrl(type: AniListMediaType, malId: number): string {
  const kind = type === "ANIME" ? "anime" : "manga";
  return `https://myanimelist.net/${kind}/${malId}`;
}
