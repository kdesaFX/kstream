/**
 * Benchmark every enabled browser source against a diverse media set,
 * using the live kdesa.stream CORS proxy (same path as the website).
 *
 * Usage: node scripts/source-hit-bench.mjs
 * Writes: scripts/source-hit-bench-results.json
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const providers = require("@p-stream/providers");

const {
  makeProviders,
  makeStandardFetcher,
  makeSimpleProxyFetcher,
  targets,
} = providers;

const SITE = "https://kdesa.stream";
const PROXY = `${SITE}/api/proxy`;
const TMDB = "https://api.themoviedb.org/3";
const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjYTg3NmZkYmVhMjNhMzI3ODY0ZjRjN2U5MzMwZTYxNiIsIm5iZiI6MTc4MjIwOTQ0NC45OTksInN1YiI6IjZhM2E1YmE0ZmMzZGFiNGNmYzMzNjIxMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WlSOswQDdxdbKu0jARJoruV6PlteoTXB1Oj4gRaibBI";

const SOURCE_TIMEOUT_MS = 40_000;
const CONCURRENCY = 3;

/** Titles to probe — mix of blockbusters, older, anime, non-English. */
const CATALOG = [
  { kind: "movie", tmdbId: "767", label: "Harry Potter Half-Blood Prince", genre: "fantasy" },
  { kind: "movie", tmdbId: "11973", label: "Kingdom of Heaven", genre: "historical" },
  { kind: "movie", tmdbId: "27205", label: "Inception", genre: "scifi" },
  { kind: "movie", tmdbId: "569094", label: "Spider-Verse Across", genre: "animation" },
  { kind: "movie", tmdbId: "693134", label: "Dune Part Two", genre: "scifi" },
  { kind: "movie", tmdbId: "372058", label: "Your Name", genre: "anime" },
  { kind: "movie", tmdbId: "496243", label: "Parasite", genre: "foreign" },
  { kind: "movie", tmdbId: "11", label: "Star Wars A New Hope", genre: "classic" },
  {
    kind: "show",
    tmdbId: "1396",
    season: 1,
    episode: 1,
    label: "Breaking Bad S1E1",
    genre: "drama",
  },
  {
    kind: "show",
    tmdbId: "66732",
    season: 1,
    episode: 1,
    label: "Stranger Things S1E1",
    genre: "scifi",
  },
  {
    kind: "show",
    tmdbId: "94605",
    season: 1,
    episode: 1,
    label: "Arcane S1E1",
    genre: "animation",
  },
  {
    kind: "show",
    tmdbId: "37854",
    season: 1,
    episode: 1,
    label: "One Piece S1E1",
    genre: "anime",
  },
  {
    kind: "show",
    tmdbId: "100088",
    season: 1,
    episode: 1,
    label: "The Last of Us S1E1",
    genre: "drama",
  },
  {
    kind: "show",
    tmdbId: "71446",
    season: 1,
    episode: 1,
    label: "La Casa de Papel S1E1",
    genre: "foreign",
  },
];

async function tmdb(path) {
  const res = await fetch(`${TMDB}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return res.json();
}

async function buildMedia(item) {
  if (item.kind === "movie") {
    const m = await tmdb(`/movie/${item.tmdbId}`);
    return {
      type: "movie",
      title: m.title || item.label,
      releaseYear: Number((m.release_date || "0").slice(0, 4)) || 0,
      tmdbId: String(item.tmdbId),
      imdbId: m.imdb_id || undefined,
    };
  }

  const show = await tmdb(`/tv/${item.tmdbId}`);
  const season = await tmdb(`/tv/${item.tmdbId}/season/${item.season}`);
  const ep =
    (season.episodes || []).find((e) => e.episode_number === item.episode) ||
    (season.episodes || [])[0];
  if (!ep) throw new Error(`No episode for ${item.label}`);

  return {
    type: "show",
    title: show.name || item.label,
    releaseYear: Number((show.first_air_date || "0").slice(0, 4)) || 0,
    tmdbId: String(item.tmdbId),
    imdbId: undefined,
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
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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
  if (/No streams|not found|NotFound/i.test(msg)) return "miss";
  if (/not compatible/i.test(msg)) return "incompatible";
  return "error";
}

async function main() {
  console.log("Building media catalog via TMDB…");
  const mediaItems = [];
  for (const item of CATALOG) {
    try {
      const media = await buildMedia(item);
      mediaItems.push({ ...item, media });
      console.log(`  ✓ ${item.label}`);
    } catch (e) {
      console.warn(`  ✗ ${item.label}: ${e.message}`);
    }
  }

  const providersApi = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    proxiedFetcher: makeSimpleProxyFetcher(PROXY, fetch),
    // Match extension/onboarding “best sources” path — without this, only
    // CORS_ALLOWED sources (≈6) are visible. Proxy still stands in for extension fetches.
    target: targets.BROWSER_EXTENSION,
    consistentIpForRequests: true,
  });

  const sources = providersApi
    .listSources()
    .filter((s) => !s.disabled)
    .sort((a, b) => (b.rank || 0) - (a.rank || 0));

  console.log(`\nTesting ${sources.length} sources × ${mediaItems.length} titles (concurrency ${CONCURRENCY})…\n`);

  const jobs = [];
  for (const source of sources) {
    for (const item of mediaItems) {
      const supports =
        (item.kind === "movie" && !!source.mediaTypes?.includes("movie")) ||
        (item.kind === "show" && !!source.mediaTypes?.includes("show")) ||
        // fallback if mediaTypes missing
        (!source.mediaTypes && true);
      if (
        item.kind === "movie" &&
        source.scrapeMovie === undefined &&
        Array.isArray(source.mediaTypes) &&
        !source.mediaTypes.includes("movie")
      ) {
        continue;
      }
      jobs.push({ source, item, supports });
    }
  }

  // Prefer meta from listSources — mediaTypes is on MetaOutput
  const realJobs = [];
  for (const source of sources) {
    for (const item of mediaItems) {
      const types = source.mediaTypes || [];
      if (types.length && !types.includes(item.kind === "movie" ? "movie" : "show")) {
        realJobs.push({
          sourceId: source.id,
          sourceName: source.name,
          rank: source.rank,
          title: item.label,
          mediaKind: item.kind,
          genre: item.genre,
          status: "skip",
          reason: "incompatible",
          ms: 0,
          streams: 0,
          embeds: 0,
        });
        continue;
      }
      realJobs.push({ source, item });
    }
  }

  const runnable = realJobs.filter((j) => j.source);
  const skipped = realJobs.filter((j) => j.status === "skip");

  const results = [...skipped];

  let done = 0;
  await mapPool(runnable, CONCURRENCY, async (job) => {
    const { source, item } = job;
    const started = Date.now();
    try {
      const out = await withTimeout(
        providersApi.runSourceScraper({
          id: source.id,
          media: item.media,
        }),
        SOURCE_TIMEOUT_MS,
        source.id,
      );
      const streams = out?.stream?.length || 0;
      const embeds = out?.embeds?.length || 0;
      const hit = streams > 0 || embeds > 0;
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        rank: source.rank,
        title: item.label,
        mediaKind: item.kind,
        genre: item.genre,
        status: hit ? "hit" : "miss",
        reason: hit ? undefined : "empty",
        ms: Date.now() - started,
        streams,
        embeds,
      });
    } catch (err) {
      const kind = classifyError(err);
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        rank: source.rank,
        title: item.label,
        mediaKind: item.kind,
        genre: item.genre,
        status: kind === "miss" ? "miss" : kind,
        reason: String(err?.message || err).slice(0, 180),
        ms: Date.now() - started,
        streams: 0,
        embeds: 0,
      });
    }
    done += 1;
    if (done % 10 === 0 || done === runnable.length) {
      const hits = results.filter((r) => r.status === "hit").length;
      console.log(`  progress ${done}/${runnable.length} (hits so far ${hits})`);
    }
  });

  // Aggregate
  const bySource = new Map();
  for (const r of results) {
    if (!bySource.has(r.sourceId)) {
      bySource.set(r.sourceId, {
        id: r.sourceId,
        name: r.sourceName,
        rank: r.rank,
        attempted: 0,
        hits: 0,
        misses: 0,
        timeouts: 0,
        errors: 0,
        skips: 0,
        movieHits: 0,
        movieAttempted: 0,
        showHits: 0,
        showAttempted: 0,
        totalMs: 0,
      });
    }
    const s = bySource.get(r.sourceId);
    if (r.status === "skip") {
      s.skips += 1;
      continue;
    }
    s.attempted += 1;
    s.totalMs += r.ms || 0;
    if (r.mediaKind === "movie") s.movieAttempted += 1;
    if (r.mediaKind === "show") s.showAttempted += 1;
    if (r.status === "hit") {
      s.hits += 1;
      if (r.mediaKind === "movie") s.movieHits += 1;
      if (r.mediaKind === "show") s.showHits += 1;
    } else if (r.status === "timeout") s.timeouts += 1;
    else if (r.status === "miss") s.misses += 1;
    else s.errors += 1;
  }

  const sourceScores = [...bySource.values()]
    .map((s) => ({
      ...s,
      hitRate: s.attempted ? Math.round((1000 * s.hits) / s.attempted) / 10 : 0,
      movieRate: s.movieAttempted ? Math.round((1000 * s.movieHits) / s.movieAttempted) / 10 : null,
      showRate: s.showAttempted ? Math.round((1000 * s.showHits) / s.showAttempted) / 10 : null,
      avgMs: s.attempted ? Math.round(s.totalMs / s.attempted) : 0,
    }))
    .sort((a, b) => b.hitRate - a.hitRate || b.hits - a.hits);

  const summary = {
    generatedAt: new Date().toISOString(),
    proxy: PROXY,
    target: "BROWSER_EXTENSION",
    titles: mediaItems.map((m) => ({ label: m.label, kind: m.kind, genre: m.genre, tmdbId: m.tmdbId })),
    sourceCount: sources.length,
    attemptCount: results.filter((r) => r.status !== "skip").length,
    hitCount: results.filter((r) => r.status === "hit").length,
    sourceScores,
    attempts: results.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.title.localeCompare(b.title)),
  };

  const outPath = new URL("./source-hit-bench-results.json", import.meta.url);
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${pathToFileURL(outPath.pathname)}`);
  console.log("\nTop sources by hit rate:");
  for (const s of sourceScores.slice(0, 15)) {
    console.log(
      `  ${String(s.hitRate).padStart(5)}%  ${String(s.hits).padStart(2)}/${String(s.attempted).padStart(2)}  ${s.name} (${s.id})  avg ${s.avgMs}ms`,
    );
  }
  console.log("\nBottom / zero-hit:");
  for (const s of sourceScores.filter((x) => x.attempted && x.hits === 0).slice(0, 20)) {
    console.log(`  ${s.name} — ${s.misses} miss, ${s.timeouts} timeout, ${s.errors} error`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
