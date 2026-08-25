import { ofetch } from "ofetch";

import { proxiedMangaUrl, requestNeverLanded } from "@/backend/manga/mangadex";
import {
  getMediaBackdrop,
  getMediaLogo,
  getMediaPoster,
  searchMovies,
  searchTVShows,
} from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

const ANILIST = "https://graphql.anilist.co";
/** TMDB Animation genre — used to prefer anime hits over live-action remakes. */
const ANIMATION_GENRE = 16;

export interface MangaAnimeAdaptation {
  tmdbId: number;
  type: TMDBContentTypes;
  /** Wide hero / details backdrop from the anime. */
  backdropUrl?: string;
  /** Portrait poster from the anime. */
  posterUrl?: string;
  /** Clear logo when TMDB has a transparent one. */
  logoUrl?: string;
}

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

type RankedCandidate = {
  id: number;
  type: TMDBContentTypes;
  score: number;
  backdropPath: string | null;
  posterPath: string | null;
};

const gqlFetch = ofetch.create({ retry: 0, timeout: 12000 });
const adaptationCache = new Map<string, MangaAnimeAdaptation | null>();
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
  backdropPath?: string | null;
}): number {
  let score = opts.popularity ?? 0;
  if (opts.genreIds?.includes(ANIMATION_GENRE)) score += 10_000;
  if (opts.originalLanguage === "ja") score += 5_000;
  if (opts.originCountry?.includes("JP")) score += 2_500;
  // Prefer titles that actually ship a wide backdrop for the hero.
  if (opts.backdropPath) score += 1_000;
  return score;
}

function orderAdaptationTitles(
  mangaTitle: string,
  adaptationTitles: string[],
): string[] {
  const mangaKey = cacheKey(mangaTitle);
  return [...adaptationTitles].sort((a, b) => {
    const aExact = a.trim().toLowerCase() === mangaKey ? 0 : 1;
    const bExact = b.trim().toLowerCase() === mangaKey ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aStarts = a.trim().toLowerCase().startsWith(mangaKey) ? 0 : 1;
    const bStarts = b.trim().toLowerCase().startsWith(mangaKey) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.length - b.length;
  });
}

async function collectCandidates(
  orderedTitles: string[],
): Promise<RankedCandidate[]> {
  const guesses = orderedTitles.slice(0, 2);
  const batches = await Promise.all(
    guesses.map(async (guess) => {
      const [shows, movies] = await Promise.all([
        searchTVShows(guess).catch(() => []),
        searchMovies(guess).catch(() => []),
      ]);
      const candidates: RankedCandidate[] = [];
      for (const s of shows) {
        candidates.push({
          id: s.id,
          type: TMDBContentTypes.TV,
          backdropPath: s.backdrop_path,
          posterPath: s.poster_path,
          score: scoreAnimeCandidate({
            originalLanguage: s.original_language,
            genreIds: s.genre_ids,
            originCountry: s.origin_country,
            popularity: s.popularity,
            backdropPath: s.backdrop_path,
          }),
        });
      }
      for (const m of movies) {
        candidates.push({
          id: m.id,
          type: TMDBContentTypes.MOVIE,
          backdropPath: m.backdrop_path,
          posterPath: m.poster_path,
          score: scoreAnimeCandidate({
            originalLanguage: m.original_language,
            genreIds: m.genre_ids,
            popularity: m.popularity,
            backdropPath: m.backdrop_path,
          }),
        });
      }
      return candidates;
    }),
  );

  return batches
    .flat()
    .filter((c) => c.score >= 10_000)
    .sort((a, b) => b.score - a.score);
}

/**
 * Resolve TMDB art + logo for a manga by borrowing its anime adaptation.
 * Titles without an anime adaptation return null.
 */
export async function resolveMangaAnimeAdaptation(
  mangaTitle: string,
): Promise<MangaAnimeAdaptation | null> {
  const key = cacheKey(mangaTitle);
  if (!key) return null;
  if (adaptationCache.has(key)) return adaptationCache.get(key) ?? null;

  try {
    const adaptationTitles = await fetchAnimeAdaptationTitles(mangaTitle);
    if (adaptationTitles.length === 0) {
      adaptationCache.set(key, null);
      return null;
    }

    const ranked = await collectCandidates(
      orderAdaptationTitles(mangaTitle, adaptationTitles),
    );
    const best =
      ranked.find((c) => c.backdropPath) ??
      ranked.find((c) => c.posterPath) ??
      ranked[0];
    if (!best) {
      adaptationCache.set(key, null);
      return null;
    }

    const logoUrl = await getMediaLogo(String(best.id), best.type);
    const resolved: MangaAnimeAdaptation = {
      tmdbId: best.id,
      type: best.type,
      backdropUrl: best.backdropPath
        ? getMediaBackdrop(best.backdropPath)
        : undefined,
      posterUrl: best.posterPath ? getMediaPoster(best.posterPath) : undefined,
      logoUrl,
    };
    adaptationCache.set(key, resolved);
    return resolved;
  } catch (err) {
    console.error("Manga anime adaptation lookup failed:", err);
    adaptationCache.set(key, null);
    return null;
  }
}

/** Clear logo only — used by the featured hero when Image logos is on. */
export async function getMangaAdaptationLogo(
  mangaTitle: string,
): Promise<string | undefined> {
  const resolved = await resolveMangaAnimeAdaptation(mangaTitle);
  return resolved?.logoUrl;
}

/**
 * Enrich a batch of manga titles with anime TMDB art. Failures stay null so
 * callers keep AniList / MangaDex fallbacks.
 */
export async function resolveMangaAnimeAdaptations(
  titles: string[],
): Promise<Map<string, MangaAnimeAdaptation>> {
  const out = new Map<string, MangaAnimeAdaptation>();
  await Promise.all(
    titles.map(async (title) => {
      const resolved = await resolveMangaAnimeAdaptation(title);
      if (resolved) out.set(title, resolved);
    }),
  );
  return out;
}
