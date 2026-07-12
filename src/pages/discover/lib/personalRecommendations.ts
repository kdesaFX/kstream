import { getMediaByGenres, getRelatedMedia } from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import type {
  TMDBMovieSearchResult,
  TMDBShowSearchResult,
} from "@/backend/metadata/types/tmdb";
import type { DiscoverMedia } from "@/pages/discover/types/discover";
import type { MediaRating } from "@/stores/ratings";

// Tuning constants for the recommendation algorithm
export const MAX_LIKED_FOR_RELATED = 6;
export const MAX_HISTORY_FOR_RELATED = 5;
export const MAX_CURRENT_FOR_RELATED = 2;
export const MAX_BOOKMARK_FOR_RELATED = 1;
export const MAX_BOOKMARK_REMINDERS = 2;
export const RELATED_PER_ITEM_LIMIT = 10;
export const RELATED_PER_LIKED_LIMIT = 14;
export const MAX_RESULTS = 40;

// Seed weights: how much trust each signal source carries. A candidate
// recommended by several seeds accumulates their weights.
const SEED_WEIGHT_LOVED = 4.0;
const SEED_WEIGHT_LIKED = 3.0;
const SEED_WEIGHT_HISTORY = 1.5;
const SEED_WEIGHT_PROGRESS = 1.2;
const SEED_WEIGHT_BOOKMARK = 1.0;
// Candidates discovered purely from the genre taste profile.
const SEED_WEIGHT_GENRE_DISCOVER = 1.6;
const GENRE_DISCOVER_LIMIT = 14;
// Diversity: max results in the final feed attributable to one seed.
const MAX_PER_SEED = 3;

// Genre profile deltas per rating level: the outer capsule segments
// ("loved"/"hated") push the taste profile roughly twice as hard as the
// inner ones, and negative ratings push harder than positive ones pull.
const RATING_GENRE_DELTAS: Record<MediaRating, number> = {
  loved: 1.75,
  liked: 1.0,
  disliked: -1.25,
  hated: -2.25,
};

// Score component multipliers
const GENRE_AFFINITY_WEIGHT = 2.0;
const QUALITY_WEIGHT = 0.4;
const POPULARITY_WEIGHT = 0.1;

// Bayesian prior for the quality score: shrink low-vote-count ratings
// toward the global mean so a 9.0 with 12 votes doesn't beat an 8.2
// with 8000 votes.
const QUALITY_PRIOR_MEAN = 6.5;
const QUALITY_PRIOR_VOTES = 50;

// Ratings older than this still count, but with half the weight.
const RATING_HALF_LIFE_DAYS = 90;

export interface HistorySource {
  tmdbId: string;
  type: "movie" | "show";
  watchedAt: number;
}

export interface ProgressSource {
  tmdbId: string;
  type: "movie" | "show";
}

export interface BookmarkSource {
  tmdbId: string;
  type: "movie" | "show";
  title: string;
  year?: number;
  poster?: string;
}

export interface RatingSource {
  tmdbId: string;
  type: "movie" | "show";
  rating: MediaRating;
  genreIds?: number[];
  ratedAt: number;
}

/** genreId -> affinity weight (positive = liked, negative = disliked) */
export type TasteProfile = Map<number, number>;

// TMDB uses composite genre ids for TV ("Sci-Fi & Fantasy") where movies
// have separate ones. Translate everything into the movie-canonical space
// so ratings on shows shape movie recommendations and vice versa.
const TV_TO_MOVIE_GENRES: Record<number, number[]> = {
  10759: [28, 12], // Action & Adventure -> Action, Adventure
  10762: [10751], // Kids -> Family
  10765: [878, 14], // Sci-Fi & Fantasy -> Science Fiction, Fantasy
  10766: [18], // Soap -> Drama
  10768: [10752], // War & Politics -> War
};

// Reverse mapping, used when targeting the TV discover endpoint with a
// profile expressed in movie-canonical genre ids.
const MOVIE_TO_TV_GENRES: Record<number, number> = {
  28: 10759,
  12: 10759,
  10751: 10762,
  878: 10765,
  14: 10765,
  10752: 10768,
};

/** English labels for the movie-canonical genre space (for UI display). */
export const GENRE_LABELS: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10763: "News",
  10764: "Reality",
  10767: "Talk",
};

/** Expands TV composite genre ids into the movie-canonical space. */
export function normalizeGenreIds(ids: number[] | undefined): number[] {
  if (!ids || ids.length === 0) return [];
  const out = new Set<number>();
  for (const id of ids) {
    const mapped = TV_TO_MOVIE_GENRES[id];
    if (mapped) mapped.forEach((m) => out.add(m));
    else out.add(id);
  }
  return Array.from(out);
}

function ratingRecencyFactor(ratedAt: number): number {
  const ageDays = Math.max(0, (Date.now() - ratedAt) / (1000 * 60 * 60 * 24));
  return 1 / (1 + ageDays / RATING_HALF_LIFE_DAYS);
}

/**
 * Builds a genre affinity map from the user's ratings — across BOTH
 * movies and shows (genre taste transcends media type; ids are
 * translated into one canonical space). Recent ratings count more;
 * "loved"/"hated" push about twice as hard as "liked"/"disliked", and
 * negatives push harder than positives pull, so one bad genre
 * experience isn't drowned out.
 */
export function buildTasteProfile(ratings: RatingSource[]): TasteProfile {
  const profile: TasteProfile = new Map();

  for (const r of ratings) {
    const genreIds = normalizeGenreIds(r.genreIds);
    if (genreIds.length === 0) continue;
    const recency = 0.5 + 0.5 * ratingRecencyFactor(r.ratedAt);
    const delta = (RATING_GENRE_DELTAS[r.rating] ?? 0) * recency;
    for (const genreId of genreIds) {
      profile.set(genreId, (profile.get(genreId) ?? 0) + delta);
    }
  }

  // Normalize to [-1, 1] so profile strength doesn't grow unbounded
  // with the number of ratings.
  let maxAbs = 0;
  for (const w of profile.values()) maxAbs = Math.max(maxAbs, Math.abs(w));
  if (maxAbs > 0) {
    for (const [id, w] of profile) profile.set(id, w / maxAbs);
  }

  return profile;
}

function genreAffinity(
  rawGenreIds: number[] | undefined,
  profile: TasteProfile,
): number {
  const genreIds = normalizeGenreIds(rawGenreIds);
  if (genreIds.length === 0 || profile.size === 0) return 0;
  let sum = 0;
  let matched = 0;
  for (const id of genreIds) {
    const w = profile.get(id);
    if (w !== undefined) {
      sum += w;
      matched += 1;
    }
  }
  if (matched === 0) return 0;
  // Average over matched genres, damped by coverage so a single strong
  // genre match on a 5-genre item doesn't count as much as a full match.
  return (sum / matched) * (matched / genreIds.length);
}

function qualityScore(voteAverage: number, voteCount: number): number {
  const shrunk =
    (voteAverage * voteCount + QUALITY_PRIOR_MEAN * QUALITY_PRIOR_VOTES) /
    (voteCount + QUALITY_PRIOR_VOTES);
  return shrunk - QUALITY_PRIOR_MEAN;
}

function toDiscoverMedia(
  item: TMDBMovieSearchResult | TMDBShowSearchResult,
  isTVShow: boolean,
): DiscoverMedia {
  const isMovie = !isTVShow;
  return {
    id: item.id,
    title: isMovie
      ? (item as TMDBMovieSearchResult).title
      : (item as TMDBShowSearchResult).name,
    name: isTVShow ? (item as TMDBShowSearchResult).name : undefined,
    poster_path: item.poster_path ?? "",
    backdrop_path: item.backdrop_path ?? "",
    overview: item.overview ?? "",
    vote_average: item.vote_average ?? 0,
    vote_count: item.vote_count ?? 0,
    type: isTVShow ? "show" : "movie",
    release_date: isMovie
      ? (item as TMDBMovieSearchResult).release_date
      : undefined,
    first_air_date: isTVShow
      ? (item as TMDBShowSearchResult).first_air_date
      : undefined,
  };
}

function bookmarkToDiscoverMedia(b: BookmarkSource): DiscoverMedia {
  return {
    id: Number(b.tmdbId),
    title: b.title,
    poster_path: b.poster ?? "",
    backdrop_path: "",
    overview: "",
    vote_average: 0,
    vote_count: 0,
    type: b.type,
    release_date: b.year ? `${b.year}-01-01` : undefined,
    first_air_date: b.year ? `${b.year}-01-01` : undefined,
  };
}

interface Seed {
  tmdbId: string;
  weight: number;
  limit: number;
}

interface ScoredCandidate {
  item: TMDBMovieSearchResult | TMDBShowSearchResult;
  sourceScore: number;
  /** The seed that first surfaced this candidate, for the diversity cap. */
  primarySeed: string;
}

/** Top positive genres of a profile, in movie-canonical ids. */
export function topPositiveGenres(
  profile: TasteProfile,
  count: number,
): number[] {
  return Array.from(profile.entries())
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}

/** Translates movie-canonical genre ids for the given discover target. */
function genresForType(genreIds: number[], isTVShow: boolean): number[] {
  if (!isTVShow) return genreIds;
  const out = new Set<number>();
  for (const id of genreIds) out.add(MOVIE_TO_TV_GENRES[id] ?? id);
  return Array.from(out);
}

/**
 * Fetches personal recommendations:
 * 1. Builds a genre taste profile from ALL ratings — movies and shows
 *    together, translated into one genre space — so loving post-
 *    apocalyptic shows shapes movie recommendations too.
 * 2. Seeds candidates from TMDB "recommendations" of same-type rated
 *    items, watch history, progress, and bookmarks — plus a TMDB
 *    discover query on the profile's top genres, so the taste profile
 *    generates candidates even when same-type seeds all point one way.
 * 3. Scores every candidate: seed trust (with a co-recommendation boost
 *    when several seeds agree) + genre affinity + Bayesian-shrunk TMDB
 *    quality + a small popularity tiebreak.
 * 4. Caps how many results any single seed contributes (diversity), then
 *    returns the top MAX_RESULTS, excluding anything watched,
 *    bookmarked, or rated.
 */
export async function fetchPersonalRecommendations(
  isTVShow: boolean,
  history: HistorySource[],
  progress: ProgressSource[],
  bookmarks: BookmarkSource[],
  excludeIds: Set<string>,
  ratings: RatingSource[] = [],
): Promise<DiscoverMedia[]> {
  const type = isTVShow ? TMDBContentTypes.TV : TMDBContentTypes.MOVIE;
  const wantedType = isTVShow ? "show" : "movie";

  const ratingsFiltered = ratings.filter((r) => r.type === wantedType);
  const positiveFiltered = ratingsFiltered
    .filter((r) => r.rating === "loved" || r.rating === "liked")
    // Loved titles first, then most recent, so when the cap hits it's
    // the strongest signals that survive.
    .sort((a, b) => {
      if (a.rating !== b.rating) return a.rating === "loved" ? -1 : 1;
      return b.ratedAt - a.ratedAt;
    })
    .slice(0, MAX_LIKED_FOR_RELATED);

  const historyFiltered = history
    .filter((h) => h.type === wantedType)
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, MAX_HISTORY_FOR_RELATED);

  const progressFiltered = progress
    .filter((p) => p.type === wantedType)
    .slice(0, MAX_CURRENT_FOR_RELATED);

  const bookmarksFiltered = bookmarks.filter((b) => b.type === wantedType);

  // Assemble seeds, strongest signal first; a media item only seeds once,
  // at its highest weight.
  const seeds: Seed[] = [];
  const seenSources = new Set<string>();
  const addSeed = (tmdbId: string, weight: number, limit: number) => {
    if (seenSources.has(tmdbId)) return;
    seenSources.add(tmdbId);
    seeds.push({ tmdbId, weight, limit });
  };

  for (const r of positiveFiltered)
    addSeed(
      r.tmdbId,
      r.rating === "loved" ? SEED_WEIGHT_LOVED : SEED_WEIGHT_LIKED,
      RELATED_PER_LIKED_LIMIT,
    );
  for (const h of historyFiltered)
    addSeed(h.tmdbId, SEED_WEIGHT_HISTORY, RELATED_PER_ITEM_LIMIT);
  for (const p of progressFiltered)
    addSeed(p.tmdbId, SEED_WEIGHT_PROGRESS, RELATED_PER_ITEM_LIMIT);
  for (const b of bookmarksFiltered.slice(0, MAX_BOOKMARK_FOR_RELATED))
    addSeed(b.tmdbId, SEED_WEIGHT_BOOKMARK, RELATED_PER_ITEM_LIMIT);

  // The taste profile spans BOTH media types.
  const profile = buildTasteProfile(ratings);

  // Never recommend anything the user has already rated: liked items are
  // already watched, disliked items are unwanted.
  const ratedIds = new Set(ratingsFiltered.map((r) => r.tmdbId));

  // Seed directly from the taste profile too: discover popular titles in
  // the user's top genres. Without this, candidates only ever come from
  // same-type watched/rated items, so one liked car movie can flood the
  // whole movie feed no matter what the profile says.
  const topGenres = genresForType(
    topPositiveGenres(profile, 2),
    isTVShow,
  );

  const fetches: Promise<
    TMDBMovieSearchResult[] | TMDBShowSearchResult[]
  >[] = seeds.map((s) => getRelatedMedia(s.tmdbId, type, s.limit));
  const seedKeys = seeds.map((s) => s.tmdbId);
  const seedWeights = seeds.map((s) => s.weight);

  if (topGenres.length > 0) {
    fetches.push(getMediaByGenres(topGenres, type, GENRE_DISCOVER_LIMIT));
    seedKeys.push("genre-discover");
    seedWeights.push(SEED_WEIGHT_GENRE_DISCOVER);
  }

  const tmdbResults = await Promise.allSettled(fetches);

  const candidates = new Map<number, ScoredCandidate>();
  for (let i = 0; i < tmdbResults.length; i += 1) {
    const result = tmdbResults[i];
    if (result.status !== "fulfilled") continue;

    for (const item of result.value) {
      const idStr = String(item.id);
      if (excludeIds.has(idStr) || ratedIds.has(idStr)) continue;
      const existing = candidates.get(item.id);
      if (existing) {
        // Co-recommendation boost: multiple seeds agreeing is a strong
        // signal, but with diminishing returns.
        existing.sourceScore += seedWeights[i] * 0.5;
      } else {
        candidates.set(item.id, {
          item,
          sourceScore: seedWeights[i],
          primarySeed: seedKeys[i],
        });
      }
    }
  }

  const scored = Array.from(candidates.values()).map((c) => {
    const genre = genreAffinity(c.item.genre_ids, profile);
    const quality = qualityScore(
      c.item.vote_average ?? 0,
      c.item.vote_count ?? 0,
    );
    const popularity = Math.log10(1 + (c.item.popularity ?? 0));
    const score =
      c.sourceScore +
      genre * GENRE_AFFINITY_WEIGHT +
      quality * QUALITY_WEIGHT +
      popularity * POPULARITY_WEIGHT;
    return { item: c.item, score, primarySeed: c.primarySeed };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity cap: no single seed may dominate the feed. Anything over
  // the cap goes to an overflow pool that only backfills at the end.
  const perSeedCount = new Map<string, number>();
  const picked: typeof scored = [];
  const overflow: typeof scored = [];
  for (const s of scored) {
    const count = perSeedCount.get(s.primarySeed) ?? 0;
    if (count < MAX_PER_SEED) {
      perSeedCount.set(s.primarySeed, count + 1);
      picked.push(s);
    } else {
      overflow.push(s);
    }
  }

  const merged = picked
    .concat(overflow)
    .slice(0, MAX_RESULTS)
    .map((s) => toDiscoverMedia(s.item, isTVShow));
  const mergedIds = new Set(merged.map((m) => m.id));

  const reminders: DiscoverMedia[] = [];
  for (const b of bookmarksFiltered) {
    const idNum = Number(b.tmdbId);
    if (excludeIds.has(b.tmdbId) || ratedIds.has(b.tmdbId)) continue;
    if (mergedIds.has(idNum)) continue;
    if (reminders.length >= MAX_BOOKMARK_REMINDERS) break;
    mergedIds.add(idNum);
    reminders.push(bookmarkToDiscoverMedia(b));
  }

  return [...reminders, ...merged];
}
