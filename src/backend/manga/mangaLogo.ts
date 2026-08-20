import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import { getMediaLogo, searchMovies, searchTVShows } from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

const ANILIST = "https://graphql.anilist.co";
/** TMDB Animation genre — used to prefer anime hits over live-action remakes. */
const ANIMATION_GENRE = 16;

type AniListTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

type AdaptationEdge = {
  relationType?: string | null;
  node?: {
    type?: string | null;
    title?: AniListTitle | null;
  } | null;
};

type AdaptationResponse = {
  data?: {
    Page?: {
      media?: Array<{
        relations?: { edges?: AdaptationEdge[] | null } | null;
      } | null> | null;
    } | null;
  } | null;
};

const gqlFetch = ofetch.create({ retry: 0, timeout: 12000 });
const logoCache = new Map<string, string | null>();
let proxyRequired = false;

async function postGraphql(body: string): Promise<AdaptationResponse> {
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
    return gqlFetch<AdaptationResponse>(proxied, init);
  }

  try {
    return await gqlFetch<AdaptationResponse>(ANILIST, init);
  } catch (err) {
    const proxied = viaProxy();
    if (!proxied || !requestNeverLanded(err)) throw err;
    const result = await gqlFetch<AdaptationResponse>(proxied, init);
    proxyRequired = true;
    return result;
  }
}

function cacheKey(title: string) {
  return title.trim().toLowerCase();
}

function titleCandidates(title: AniListTitle | null | undefined): string[] {
  return [title?.english, title?.romaji, title?.native]
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t));
}

/** Pull anime adaptation titles from AniList for a manga search string. */
export async function fetchAnimeAdaptationTitles(
  mangaTitle: string,
): Promise<string[]> {
  const q = mangaTitle.trim();
  if (!q) return [];

  const body = JSON.stringify({
    query: `query ($s: String) {
      Page(perPage: 1) {
        media(search: $s, type: MANGA, sort: SEARCH_MATCH) {
          relations {
            edges {
              relationType
              node { type title { romaji english native } }
            }
          }
        }
      }
    }`,
    variables: { s: q },
  });

  const res = await postGraphql(body);
  const edges = res.data?.Page?.media?.[0]?.relations?.edges ?? [];
  const titles: string[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const relation = (edge.relationType ?? "").toUpperCase();
    if (relation !== "ADAPTATION" && relation !== "SOURCE") continue;
    if ((edge.node?.type ?? "").toUpperCase() !== "ANIME") continue;
    for (const name of titleCandidates(edge.node?.title)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(name);
    }
  }

  return titles;
}

function scoreAnimeCandidate(opts: {
  originalLanguage?: string;
  genreIds?: number[];
  originCountry?: string[];
  popularity?: number;
}): number {
  let score = opts.popularity ?? 0;
  if (opts.genreIds?.includes(ANIMATION_GENRE)) score += 10_000;
  if (opts.originalLanguage === "ja") score += 5_000;
  if (opts.originCountry?.includes("JP")) score += 2_500;
  return score;
}

/**
 * Resolve a TMDB clear logo for a manga by borrowing its anime adaptation.
 * Titles without an anime adaptation return undefined (text title stays).
 */
export async function getMangaAdaptationLogo(
  mangaTitle: string,
): Promise<string | undefined> {
  const key = cacheKey(mangaTitle);
  if (!key) return undefined;
  if (logoCache.has(key)) return logoCache.get(key) ?? undefined;

  try {
    const adaptationTitles = await fetchAnimeAdaptationTitles(mangaTitle);
    if (adaptationTitles.length === 0) {
      logoCache.set(key, null);
      return undefined;
    }

    // Prefer adaptations whose name matches the manga (main series over OVAs).
    const mangaKey = key;
    const orderedTitles = [...adaptationTitles].sort((a, b) => {
      const aExact = a.trim().toLowerCase() === mangaKey ? 0 : 1;
      const bExact = b.trim().toLowerCase() === mangaKey ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aStarts = a.trim().toLowerCase().startsWith(mangaKey) ? 0 : 1;
      const bStarts = b.trim().toLowerCase().startsWith(mangaKey) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.length - b.length;
    });

    type Candidate = {
      id: number;
      type: TMDBContentTypes;
      score: number;
    };
    const candidates: Candidate[] = [];

    for (const guess of orderedTitles.slice(0, 4)) {
      // eslint-disable-next-line no-await-in-loop
      const [shows, movies] = await Promise.all([
        searchTVShows(guess).catch(() => []),
        searchMovies(guess).catch(() => []),
      ]);

      for (const s of shows) {
        candidates.push({
          id: s.id,
          type: TMDBContentTypes.TV,
          score: scoreAnimeCandidate({
            originalLanguage: s.original_language,
            genreIds: s.genre_ids,
            originCountry: s.origin_country,
            popularity: s.popularity,
          }),
        });
      }
      for (const m of movies) {
        candidates.push({
          id: m.id,
          type: TMDBContentTypes.MOVIE,
          score: scoreAnimeCandidate({
            originalLanguage: m.original_language,
            genreIds: m.genre_ids,
            popularity: m.popularity,
          }),
        });
      }
    }

    const ranked = candidates
      .filter((c) => c.score >= 10_000)
      .sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    for (const candidate of ranked) {
      const idKey = `${candidate.type}:${candidate.id}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      // eslint-disable-next-line no-await-in-loop
      const logo = await getMediaLogo(String(candidate.id), candidate.type);
      if (logo) {
        logoCache.set(key, logo);
        return logo;
      }
      if (seen.size >= 5) break;
    }

    logoCache.set(key, null);
    return undefined;
  } catch (err) {
    console.error("Manga adaptation logo lookup failed:", err);
    logoCache.set(key, null);
    return undefined;
  }
}
