import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

const ANILIST = "https://graphql.anilist.co";
const BATCH_SIZE = 20;

export interface MangaArt {
  anilistId: number;
  /** Wide art — the manga equivalent of a TMDB backdrop. */
  banner?: string;
  /** Prefer the anime adaptation's art when the manga has one. */
  animeBanner?: string;
  animeTitle?: string;
  animeYear?: number;
  /** AniList average score, 0-100. */
  score?: number;
}

type AniListRelatedMedia = {
  type: "ANIME" | "MANGA";
  format: string | null;
  bannerImage: string | null;
  startDate?: { year?: number | null } | null;
  title: {
    english?: string | null;
    romaji?: string | null;
  };
};

type AniListRelationEdge = {
  relationType: string;
  node: AniListRelatedMedia;
};

type AniListMedia = {
  id: number;
  bannerImage: string | null;
  averageScore: number | null;
  relations?: { edges?: AniListRelationEdge[] | null } | null;
};

type AniListResponse = {
  data?: Record<string, { media?: AniListMedia[] | null } | null> | null;
};

const artFetch = ofetch.create({ retry: 0, timeout: 15000 });

/** Cache per session so flipping between tabs doesn't re-query AniList. */
const cache = new Map<string, MangaArt | null>();

/** AniList blocks our proxy's IP but allows browser CORS, so direct comes first. */
let proxyRequired = false;

/**
 * One aliased request covers a whole batch of titles. `Page(perPage: 1)` rather
 * than `Media(...)`: an unknown title comes back as an empty list, where `Media`
 * raises a 404 that voids every other alias in the same request.
 */
export function buildArtQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$s${i}: String`).join(
    ", ",
  );
  const aliases = Array.from(
    { length: count },
    (_, i) =>
      `  m${i}: Page(perPage: 1) { media(search: $s${i}, type: MANGA) { id bannerImage averageScore relations { edges { relationType node { type format bannerImage startDate { year } title { english romaji } } } } } }`,
  ).join("\n");
  return `query (${vars}) {\n${aliases}\n}`;
}

export function pickAnimeAdaptation(
  edges: AniListRelationEdge[] | null | undefined,
): AniListRelatedMedia | undefined {
  const formatRank: Record<string, number> = {
    TV: 0,
    TV_SHORT: 1,
    ONA: 2,
    MOVIE: 3,
    OVA: 4,
    SPECIAL: 5,
  };
  return (edges ?? [])
    .filter(
      (edge) =>
        edge.relationType === "ADAPTATION" && edge.node.type === "ANIME",
    )
    .sort((a, b) => {
      const format =
        (formatRank[a.node.format ?? ""] ?? 99) -
        (formatRank[b.node.format ?? ""] ?? 99);
      if (format !== 0) return format;
      return (
        (a.node.startDate?.year ?? Number.MAX_SAFE_INTEGER) -
        (b.node.startDate?.year ?? Number.MAX_SAFE_INTEGER)
      );
    })[0]?.node;
}

async function postGraphql(body: string): Promise<AniListResponse> {
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
    return artFetch<AniListResponse>(proxied, init);
  }

  try {
    return await artFetch<AniListResponse>(ANILIST, init);
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await artFetch<AniListResponse>(proxied, init);
    proxyRequired = true;
    return result;
  }
}

function cacheKey(title: string) {
  return title.trim().toLowerCase();
}

async function fetchBatch(titles: string[]): Promise<void> {
  const query = buildArtQuery(titles.length);
  const variables = Object.fromEntries(titles.map((t, i) => [`s${i}`, t]));
  const res = await postGraphql(JSON.stringify({ query, variables }));

  titles.forEach((title, i) => {
    const hit = res.data?.[`m${i}`]?.media?.[0];
    const anime = pickAnimeAdaptation(hit?.relations?.edges);
    cache.set(
      cacheKey(title),
      hit
        ? {
            anilistId: hit.id,
            banner: hit.bannerImage ?? undefined,
            animeBanner: anime?.bannerImage ?? undefined,
            animeTitle: anime
              ? (anime.title.english ?? anime.title.romaji ?? undefined)
              : undefined,
            animeYear: anime?.startDate?.year ?? undefined,
            score: hit.averageScore ?? undefined,
          }
        : null,
    );
  });
}

/**
 * Look up wide art for manga titles. Missing titles simply have no entry; a
 * failed batch is not fatal, the caller falls back to cover art.
 */
export async function fetchMangaArt(
  titles: string[],
): Promise<Map<string, MangaArt>> {
  const wanted = titles.filter((t) => t.trim());
  const missing = [...new Set(wanted.map(cacheKey))].filter(
    (key) => !cache.has(key),
  );

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    try {
      // eslint-disable-next-line no-await-in-loop -- AniList rate-limits bursts
      await fetchBatch(chunk);
    } catch (err) {
      console.error("AniList manga art lookup failed:", err);
      for (const key of chunk) cache.set(key, null);
    }
  }

  const out = new Map<string, MangaArt>();
  for (const title of wanted) {
    const art = cache.get(cacheKey(title));
    if (art) out.set(title, art);
  }
  return out;
}
