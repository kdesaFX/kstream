import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

const ANILIST = "https://graphql.anilist.co";

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type RecNode = {
  mediaRecommendation?: {
    id: number;
    title?: AniListTitle | null;
  } | null;
};

type SearchResponse = {
  data?: {
    Page?: {
      media?: Array<{ id: number } | null> | null;
    } | null;
  } | null;
};

type RecResponse = {
  data?: {
    Media?: {
      recommendations?: {
        nodes?: RecNode[] | null;
      } | null;
    } | null;
  } | null;
};

const gqlFetch = ofetch.create({ retry: 0, timeout: 15000 });
let proxyRequired = false;

async function postGraphql(body: string): Promise<unknown> {
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
    return gqlFetch(proxied, init);
  }

  try {
    return await gqlFetch(ANILIST, init);
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await gqlFetch(proxied, init);
    proxyRequired = true;
    return result;
  }
}

function pickTitle(title?: AniListTitle | null): string {
  if (!title) return "";
  return (title.english || title.romaji || title.native || "").trim();
}

async function anilistMangaIdForTitle(title: string): Promise<number | null> {
  const q = title.trim();
  if (!q) return null;
  const body = JSON.stringify({
    query: `query ($s: String) {
      Page(perPage: 1) { media(search: $s, type: MANGA) { id } }
    }`,
    variables: { s: q },
  });
  const res = (await postGraphql(body)) as SearchResponse;
  return res.data?.Page?.media?.[0]?.id ?? null;
}

/** AniList user-facing rec list for a manga title (TMDB /recommendations equivalent). */
export async function fetchAnilistMangaRecommendationTitles(
  seedTitle: string,
  limit = 20,
): Promise<string[]> {
  const anilistId = await anilistMangaIdForTitle(seedTitle);
  if (!anilistId) return [];

  const body = JSON.stringify({
    query: `query ($id: Int, $perPage: Int) {
      Media(id: $id, type: MANGA) {
        recommendations(page: 1, perPage: $perPage, sort: RATING_DESC) {
          nodes {
            mediaRecommendation {
              title { romaji english native }
            }
          }
        }
      }
    }`,
    variables: { id: anilistId, perPage: limit },
  });

  const res = (await postGraphql(body)) as RecResponse;
  const nodes = res.data?.Media?.recommendations?.nodes ?? [];
  const titles: string[] = [];
  for (const node of nodes) {
    const name = pickTitle(node.mediaRecommendation?.title);
    if (name) titles.push(name);
  }
  return titles;
}
