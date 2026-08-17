/**
 * Duration audit: for a spread of titles, compare the runtime TMDB reports with
 * the duration each source's playlist actually contains. Wide misses mean the
 * source served a different title.
 *
 * Usage: node scripts/goon-duration-audit.mjs [--only reyna,oneembed]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const providers = require(process.env.GOON_PROVIDERS_PATH || "@p-stream/providers");
const { makeProviders, makeStandardFetcher, makeSimpleProxyFetcher, setM3U8ProxyUrl, targets } =
  providers;

const SITE = "https://kdesa.stream";
setM3U8ProxyUrl(`${SITE}/api`);

const TMDB = "https://api.themoviedb.org/3";
const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjYTg3NmZkYmVhMjNhMzI3ODY0ZjRjN2U5MzMwZTYxNiIsIm5iZiI6MTc4MjIwOTQ0NC45OTksInN1YiI6IjZhM2E1YmE0ZmMzZGFiNGNmYzMzNjIxMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WlSOswQDdxdbKu0jARJoruV6PlteoTXB1Oj4gRaibBI";

const CATALOG = [
  { kind: "show", tmdbId: "86836", season: 1, episode: 1, label: "Why the Hell Teacher" },
  { kind: "show", tmdbId: "85937", season: 1, episode: 1, label: "Demon Slayer" },
  { kind: "show", tmdbId: "95479", season: 1, episode: 1, label: "Jujutsu Kaisen" },
  { kind: "show", tmdbId: "80564", season: 1, episode: 1, label: "Rascal Bunny Girl" },
  { kind: "show", tmdbId: "65930", season: 1, episode: 1, label: "My Hero Academia" },
  { kind: "show", tmdbId: "1396", season: 1, episode: 1, label: "Breaking Bad" },
  { kind: "show", tmdbId: "66732", season: 1, episode: 1, label: "Stranger Things" },
  { kind: "show", tmdbId: "60625", season: 1, episode: 1, label: "Rick and Morty" },
  { kind: "movie", tmdbId: "27205", label: "Inception" },
  { kind: "movie", tmdbId: "372058", label: "Your Name" },
  { kind: "movie", tmdbId: "675445", label: "PAW Patrol" },
];

const only = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1].split(",") : [];
})();

async function tmdb(p) {
  const res = await fetch(`${TMDB}${p}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${p}`);
  return res.json();
}

async function buildMedia(item) {
  if (item.kind === "movie") {
    const m = await tmdb(`/movie/${item.tmdbId}`);
    return {
      label: item.label,
      expected: m.runtime,
      media: {
        type: "movie",
        title: m.title,
        releaseYear: Number((m.release_date || "0").slice(0, 4)) || 0,
        tmdbId: String(item.tmdbId),
        imdbId: m.imdb_id || undefined,
      },
    };
  }
  const show = await tmdb(`/tv/${item.tmdbId}`);
  const season = await tmdb(`/tv/${item.tmdbId}/season/${item.season}`);
  const ep = season.episodes.find((e) => e.episode_number === item.episode) ?? season.episodes[0];
  return {
    label: item.label,
    expected: ep.runtime ?? show.episode_run_time?.[0] ?? null,
    media: {
      type: "show",
      title: show.name,
      releaseYear: Number((show.first_air_date || "0").slice(0, 4)) || 0,
      tmdbId: String(item.tmdbId),
      season: { number: item.season, tmdbId: String(season.id), title: season.name },
      episode: { number: ep.episode_number, tmdbId: String(ep.id), title: ep.name },
    },
  };
}

function playlistSeconds(text) {
  let total = 0;
  for (const line of text.split("\n")) {
    const m = /^#EXTINF:([\d.]+)/.exec(line.trim());
    if (m) total += Number(m[1]);
  }
  return total;
}

function firstVariant(text, baseUrl) {
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF") && lines[i + 1] && !lines[i + 1].startsWith("#")) {
      try {
        return new URL(lines[i + 1], baseUrl).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function streamMinutes(stream) {
  if (stream.type !== "hls") return null;
  const headers = { ...(stream.preferredHeaders ?? {}), ...(stream.headers ?? {}) };
  const res = await fetch(stream.playlist, { headers, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!text.includes("#EXTM3U")) return null;
  let seconds = playlistSeconds(text);
  if (!seconds) {
    const variant = firstVariant(text, res.url || stream.playlist);
    if (!variant) return null;
    const inner = await fetch(variant, { headers, signal: AbortSignal.timeout(20_000) });
    seconds = playlistSeconds(await inner.text());
  }
  return seconds ? seconds / 60 : null;
}

const api = makeProviders({
  fetcher: makeStandardFetcher(fetch),
  proxiedFetcher: makeSimpleProxyFetcher(`${SITE}/api/proxy`, fetch),
  target: targets.BROWSER_EXTENSION,
  consistentIpForRequests: true,
});

const sources = api
  .listSources()
  .filter((s) => !s.disabled)
  .filter((s) => !only.length || only.includes(s.id));

console.log(`sources: ${sources.map((s) => s.id).join(", ")}\n`);

const tally = {};
for (const item of CATALOG) {
  const { media, expected, label } = await buildMedia(item);
  const line = [`${label.padEnd(20)} expect ${String(expected ?? "?").padStart(3)}min`];
  for (const source of sources) {
    if (source.mediaTypes?.length && !source.mediaTypes.includes(media.type)) continue;
    tally[source.id] ??= { hits: 0, wrong: 0 };
    try {
      const out = await Promise.race([
        api.runSourceScraper({ id: source.id, media }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 40_000)),
      ]);
      const stream = out?.stream?.[0];
      if (!stream) continue;
      const minutes = await streamMinutes(stream);
      if (minutes == null) continue;
      tally[source.id].hits += 1;
      const ratio = expected ? minutes / expected : null;
      const wrong = ratio != null && (ratio > 1.5 || ratio < 0.6);
      if (wrong) tally[source.id].wrong += 1;
      line.push(`${source.id}=${minutes.toFixed(1)}${wrong ? " WRONG" : ""}`);
    } catch {
      // miss — not interesting for this audit
    }
  }
  console.log(line.join("  "));
}

console.log("\nper-source wrong-length rate:");
for (const [id, t] of Object.entries(tally)) {
  if (!t.hits) continue;
  console.log(`  ${id.padEnd(14)} ${t.wrong}/${t.hits}`);
}
