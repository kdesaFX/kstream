/**
 * GOON TEST — measure source hit rates by playback env × media bucket,
 * then regenerate `src/utils/media/sourcePerformance.generated.ts`.
 *
 * Usage:
 *   node scripts/goon-test.mjs
 *   node scripts/goon-test.mjs --quick   # smaller catalog
 *
 * Envs tested:
 *   browser   → targets.BROWSER (CORS-only sources, site proxy)
 *   extension → targets.BROWSER_EXTENSION (all sources, site proxy stand-in)
 *
 * Buckets: movie | show | anime (anime = JP Animation titles)
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const providers = require("@p-stream/providers");
const {
  makeProviders,
  makeStandardFetcher,
  makeSimpleProxyFetcher,
  targets,
} = providers;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUICK = process.argv.includes("--quick");

const SITE = "https://kdesa.stream";
const PROXY = `${SITE}/api/proxy`;
const TMDB = "https://api.themoviedb.org/3";
const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjYTg3NmZkYmVhMjNhMzI3ODY0ZjRjN2U5MzMwZTYxNiIsIm5iZiI6MTc4MjIwOTQ0NC45OTksInN1YiI6IjZhM2E1YmE0ZmMzZGFiNGNmYzMzNjIxMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WlSOswQDdxdbKu0jARJoruV6PlteoTXB1Oj4gRaibBI";

const SOURCE_TIMEOUT_MS = 35_000;
const CONCURRENCY = 4;
const ANIMATION_GENRE = 16;

const FULL_CATALOG = [
  // Movies
  { kind: "movie", tmdbId: "767", label: "Harry Potter HBP", bucketHint: "movie" },
  { kind: "movie", tmdbId: "11973", label: "Kingdom of Heaven", bucketHint: "movie" },
  { kind: "movie", tmdbId: "27205", label: "Inception", bucketHint: "movie" },
  { kind: "movie", tmdbId: "569094", label: "Spider-Verse", bucketHint: "movie" },
  { kind: "movie", tmdbId: "693134", label: "Dune Part Two", bucketHint: "movie" },
  { kind: "movie", tmdbId: "496243", label: "Parasite", bucketHint: "movie" },
  { kind: "movie", tmdbId: "11", label: "Star Wars", bucketHint: "movie" },
  { kind: "movie", tmdbId: "155", label: "The Dark Knight", bucketHint: "movie" },
  { kind: "movie", tmdbId: "680", label: "Pulp Fiction", bucketHint: "movie" },
  { kind: "movie", tmdbId: "550", label: "Fight Club", bucketHint: "movie" },
  { kind: "movie", tmdbId: "603", label: "The Matrix", bucketHint: "movie" },
  { kind: "movie", tmdbId: "157336", label: "Interstellar", bucketHint: "movie" },
  { kind: "movie", tmdbId: "299536", label: "Infinity War", bucketHint: "movie" },
  { kind: "movie", tmdbId: "424694", label: "Bohemian Rhapsody", bucketHint: "movie" },
  { kind: "movie", tmdbId: "438631", label: "Dune", bucketHint: "movie" },
  { kind: "movie", tmdbId: "346698", label: "Barbie", bucketHint: "movie" },
  { kind: "movie", tmdbId: "76600", label: "Avatar 2", bucketHint: "movie" },
  { kind: "movie", tmdbId: "872585", label: "Oppenheimer", bucketHint: "movie" },
  // Anime movies
  { kind: "movie", tmdbId: "372058", label: "Your Name", bucketHint: "anime" },
  { kind: "movie", tmdbId: "128", label: "Princess Mononoke", bucketHint: "anime" },
  { kind: "movie", tmdbId: "129", label: "Spirited Away", bucketHint: "anime" },
  { kind: "movie", tmdbId: "378064", label: "A Silent Voice", bucketHint: "anime" },
  { kind: "movie", tmdbId: "149", label: "Akira", bucketHint: "anime" },
  { kind: "movie", tmdbId: "493529", label: "Demon Slayer Mugen", bucketHint: "anime" },
  // Shows
  { kind: "show", tmdbId: "1396", season: 1, episode: 1, label: "Breaking Bad S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "66732", season: 1, episode: 1, label: "Stranger Things S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "94605", season: 1, episode: 1, label: "Arcane S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "100088", season: 1, episode: 1, label: "Last of Us S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "71446", season: 1, episode: 1, label: "La Casa de Papel S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "1399", season: 1, episode: 1, label: "Game of Thrones S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "87108", season: 1, episode: 1, label: "Chernobyl S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "60625", season: 1, episode: 1, label: "Rick and Morty S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "1402", season: 1, episode: 1, label: "The Walking Dead S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "1668", season: 1, episode: 1, label: "Friends S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "84958", season: 1, episode: 1, label: "Loki S1E1", bucketHint: "show" },
  { kind: "show", tmdbId: "95557", season: 1, episode: 1, label: "Invincible S1E1", bucketHint: "show" },
  // Anime shows
  { kind: "show", tmdbId: "37854", season: 1, episode: 1, label: "One Piece S1E1", bucketHint: "anime" },
  { kind: "show", tmdbId: "46261", season: 1, episode: 1, label: "Attack on Titan S1E1", bucketHint: "anime" },
  { kind: "show", tmdbId: "85937", season: 1, episode: 1, label: "Demon Slayer S1E1", bucketHint: "anime" },
  { kind: "show", tmdbId: "30984", season: 1, episode: 1, label: "Cowboy Bebop S1E1", bucketHint: "anime" },
  { kind: "show", tmdbId: "31910", season: 1, episode: 1, label: "Naruto S1E1", bucketHint: "anime" },
  { kind: "show", tmdbId: "1429", season: 1, episode: 1, label: "Attack on Titan (dup id)", bucketHint: "anime" },
];

// 1429 is Attack on Titan (same franchise) — replace with Jujutsu Kaisen
FULL_CATALOG[FULL_CATALOG.length - 1] = {
  kind: "show",
  tmdbId: "95479",
  season: 1,
  episode: 1,
  label: "Jujutsu Kaisen S1E1",
  bucketHint: "anime",
};

const QUICK_CATALOG = FULL_CATALOG.filter((_, i) => i % 2 === 0).slice(0, 14);
const CATALOG = QUICK ? QUICK_CATALOG : FULL_CATALOG;

const ENVS = [
  { key: "browser", target: targets.BROWSER, consistentIp: false },
  { key: "extension", target: targets.BROWSER_EXTENSION, consistentIp: true },
];

async function tmdb(p) {
  const res = await fetch(`${TMDB}${p}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${p}`);
  return res.json();
}

function isAnimeMeta(genreIds, originalLanguage, originCountry) {
  if (!genreIds?.includes(ANIMATION_GENRE)) return false;
  if ((originalLanguage || "").toLowerCase() === "ja") return true;
  return (originCountry || []).some((c) => String(c).toUpperCase() === "JP");
}

async function buildMedia(item) {
  if (item.kind === "movie") {
    const m = await tmdb(`/movie/${item.tmdbId}`);
    const genreIds = (m.genres || []).map((g) => g.id);
    const anime = isAnimeMeta(genreIds, m.original_language, m.origin_country);
    return {
      type: "movie",
      title: m.title || item.label,
      releaseYear: Number((m.release_date || "0").slice(0, 4)) || 0,
      tmdbId: String(item.tmdbId),
      imdbId: m.imdb_id || undefined,
      bucket: anime ? "anime" : "movie",
      label: item.label,
    };
  }
  const show = await tmdb(`/tv/${item.tmdbId}`);
  const season = await tmdb(`/tv/${item.tmdbId}/season/${item.season}`);
  const ep =
    (season.episodes || []).find((e) => e.episode_number === item.episode) ||
    (season.episodes || [])[0];
  if (!ep) throw new Error(`No episode for ${item.label}`);
  const genreIds = (show.genres || []).map((g) => g.id);
  const anime = isAnimeMeta(genreIds, show.original_language, show.origin_country);
  return {
    type: "show",
    title: show.name || item.label,
    releaseYear: Number((show.first_air_date || "0").slice(0, 4)) || 0,
    tmdbId: String(item.tmdbId),
    season: {
      number: item.season,
      tmdbId: String(season.id),
      title: season.name || `Season ${item.season}`,
    },
    episode: {
      number: ep.episode_number,
      tmdbId: String(ep.id),
      title: ep.name || `Episode ${ep.episode_number}`,
    },
    bucket: anime ? "anime" : "show",
    label: item.label,
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function classifyError(err) {
  const msg = String(err?.message || err || "");
  if (/timed out/i.test(msg)) return "timeout";
  if (/No streams|not found|NotFound|Couldn't find/i.test(msg)) return "miss";
  if (/not compatible/i.test(msg)) return "skip";
  return "error";
}

function buildMatrix(attempts) {
  /** @type {Record<string, any>} */
  const scores = {};
  const counters = {};

  for (const a of attempts) {
    if (a.status === "skip") continue;
    const key = `${a.sourceId}|${a.env}|${a.bucket}`;
    if (!counters[key]) counters[key] = { hits: 0, n: 0 };
    counters[key].n += 1;
    if (a.status === "hit") counters[key].hits += 1;
  }

  for (const [key, c] of Object.entries(counters)) {
    if (c.n < 1) continue;
    const [sourceId, env, bucket] = key.split("|");
    if (!scores[sourceId]) scores[sourceId] = {};
    if (!scores[sourceId][env]) scores[sourceId][env] = {};
    scores[sourceId][env][bucket] = Math.round((1000 * c.hits) / c.n) / 10;
  }

  const animeOnly = ["tqq", "myanime", "anidap"];
  // Anime specialists must not lead movie/show queues if genre detection fails open.
  for (const id of animeOnly) {
    if (!scores[id]) continue;
    for (const env of Object.keys(scores[id])) {
      scores[id][env].movie = 0;
      scores[id][env].show = 0;
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    animeOnly,
    scores,
  };
}

function renderGeneratedTs(matrix) {
  const body = JSON.stringify(matrix, null, 2);
  return `/**
 * AUTO-GENERATED by node scripts/goon-test.mjs — do not edit by hand.
 * Re-run a goon test to refresh scores after adding/fixing sources.
 */

export type PlaybackEnvScore = "browser" | "extension";
export type MediaBucketScore = "movie" | "show" | "anime";

export type SourceScoreMatrix = {
  updatedAt: string;
  /** Sources that should only run for anime titles. */
  animeOnly: string[];
  /**
   * Hit-rate 0–100 per source → env → media bucket.
   * Missing buckets mean insufficient samples.
   */
  scores: Record<
    string,
    Partial<
      Record<PlaybackEnvScore, Partial<Record<MediaBucketScore, number>>>
    >
  >;
};

export const SOURCE_SCORE_MATRIX: SourceScoreMatrix = ${body};
`;
}

function disableRecommendations(attempts) {
  const bySource = new Map();
  for (const a of attempts) {
    if (a.status === "skip") continue;
    if (!bySource.has(a.sourceId)) {
      bySource.set(a.sourceId, { id: a.sourceId, name: a.sourceName, n: 0, hits: 0 });
    }
    const s = bySource.get(a.sourceId);
    s.n += 1;
    if (a.status === "hit") s.hits += 1;
  }
  return [...bySource.values()]
    .filter((s) => s.n >= 6 && s.hits === 0)
    .map((s) => `${s.name} (${s.id}): 0/${s.n} — consider disabled: true`);
}

async function main() {
  console.log(`GOON TEST ${QUICK ? "(quick)" : "(full)"} — ${CATALOG.length} titles × ${ENVS.length} envs\n`);

  console.log("Building media catalog…");
  const mediaItems = [];
  for (const item of CATALOG) {
    try {
      const media = await buildMedia(item);
      mediaItems.push(media);
      console.log(`  ✓ ${media.label} [${media.bucket}]`);
    } catch (e) {
      console.warn(`  ✗ ${item.label}: ${e.message}`);
    }
  }

  const attempts = [];

  for (const env of ENVS) {
    const api = makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeSimpleProxyFetcher(PROXY, fetch),
      target: env.target,
      consistentIpForRequests: env.consistentIp,
    });
    const sources = api.listSources().filter((s) => !s.disabled);
    console.log(`\n=== env=${env.key} sources=${sources.length} ===`);

    const jobs = [];
    for (const source of sources) {
      for (const media of mediaItems) {
        const types = source.mediaTypes || [];
        if (types.length && !types.includes(media.type)) {
          attempts.push({
            env: env.key,
            sourceId: source.id,
            sourceName: source.name,
            title: media.label,
            bucket: media.bucket,
            mediaKind: media.type,
            status: "skip",
            reason: "incompatible",
            ms: 0,
          });
          continue;
        }
        jobs.push({ source, media });
      }
    }

    let done = 0;
    await mapPool(jobs, CONCURRENCY, async ({ source, media }) => {
      const started = Date.now();
      try {
        const out = await withTimeout(
          api.runSourceScraper({ id: source.id, media }),
          SOURCE_TIMEOUT_MS,
          source.id,
        );
        const hit = (out?.stream?.length || 0) > 0 || (out?.embeds?.length || 0) > 0;
        attempts.push({
          env: env.key,
          sourceId: source.id,
          sourceName: source.name,
          title: media.label,
          bucket: media.bucket,
          mediaKind: media.type,
          status: hit ? "hit" : "miss",
          ms: Date.now() - started,
          streams: out?.stream?.length || 0,
          embeds: out?.embeds?.length || 0,
        });
      } catch (err) {
        const kind = classifyError(err);
        attempts.push({
          env: env.key,
          sourceId: source.id,
          sourceName: source.name,
          title: media.label,
          bucket: media.bucket,
          mediaKind: media.type,
          status: kind === "miss" ? "miss" : kind,
          reason: String(err?.message || err).slice(0, 160),
          ms: Date.now() - started,
        });
      }
      done += 1;
      if (done % 20 === 0 || done === jobs.length) {
        const hits = attempts.filter((a) => a.env === env.key && a.status === "hit").length;
        console.log(`  [${env.key}] ${done}/${jobs.length} (hits ${hits})`);
      }
    });
  }

  const matrix = buildMatrix(attempts);
  const resultsPath = path.join(__dirname, "goon-test-results.json");
  const generatedPath = path.join(
    ROOT,
    "src/utils/media/sourcePerformance.generated.ts",
  );

  const summary = {
    generatedAt: matrix.updatedAt,
    proxy: PROXY,
    titleCount: mediaItems.length,
    attemptCount: attempts.filter((a) => a.status !== "skip").length,
    hitCount: attempts.filter((a) => a.status === "hit").length,
    matrix,
    disableRecommendations: disableRecommendations(attempts),
    attempts,
  };

  writeFileSync(resultsPath, JSON.stringify(summary, null, 2));
  writeFileSync(generatedPath, renderGeneratedTs(matrix));

  console.log(`\nWrote ${resultsPath}`);
  console.log(`Wrote ${generatedPath}`);
  console.log("\nHit rates by source × env × bucket:");
  for (const [id, envs] of Object.entries(matrix.scores)) {
    console.log(`  ${id}`);
    for (const [env, buckets] of Object.entries(envs)) {
      const parts = Object.entries(buckets)
        .map(([b, v]) => `${b}=${v}%`)
        .join(" ");
      console.log(`    ${env}: ${parts}`);
    }
  }
  if (summary.disableRecommendations.length) {
    console.log("\nDisable candidates:");
    for (const line of summary.disableRecommendations) console.log(`  - ${line}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
