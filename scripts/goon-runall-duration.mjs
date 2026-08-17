/**
 * Run a full scrape (sources + embeds, like the app does) for one title and
 * report the duration of whatever comes back, so we can tell a real hit from a
 * source that served some other video.
 *
 * Usage: node scripts/goon-runall-duration.mjs --tv 86836 --season 1 --episode 1
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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function tmdb(p) {
  const res = await fetch(`${TMDB}${p}`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${p}`);
  return res.json();
}

const tvId = arg("tv");
const movieId = arg("movie");
const seasonNumber = Number(arg("season", "1"));
const episodeNumber = Number(arg("episode", "1"));

async function build() {
  if (movieId) {
    const m = await tmdb(`/movie/${movieId}`);
    return {
      expected: m.runtime,
      media: {
        type: "movie",
        title: m.title,
        releaseYear: Number((m.release_date || "0").slice(0, 4)) || 0,
        tmdbId: String(movieId),
        imdbId: m.imdb_id || undefined,
      },
    };
  }
  const show = await tmdb(`/tv/${tvId}`);
  const season = await tmdb(`/tv/${tvId}/season/${seasonNumber}`);
  const ep = season.episodes.find((e) => e.episode_number === episodeNumber) ?? season.episodes[0];
  return {
    expected: ep.runtime ?? show.episode_run_time?.[0] ?? null,
    media: {
      type: "show",
      title: show.name,
      releaseYear: Number((show.first_air_date || "0").slice(0, 4)) || 0,
      tmdbId: String(tvId),
      season: { number: seasonNumber, tmdbId: String(season.id), title: season.name },
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

async function minutesOf(stream) {
  const headers = { ...(stream.preferredHeaders ?? {}), ...(stream.headers ?? {}) };
  if (stream.type !== "hls") return null;
  const res = await fetch(stream.playlist, { headers, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let seconds = playlistSeconds(text);
  if (!seconds) {
    const variant = firstVariant(text, res.url || stream.playlist);
    if (!variant) return null;
    seconds = playlistSeconds(
      await (await fetch(variant, { headers, signal: AbortSignal.timeout(20_000) })).text(),
    );
  }
  return seconds ? seconds / 60 : null;
}

const { media, expected } = await build();
console.log(`${media.title} — expected ${expected ?? "?"}min\n`);

for (const env of [
  { key: "browser", target: targets.BROWSER, consistentIp: false },
  { key: "extension", target: targets.BROWSER_EXTENSION, consistentIp: true },
]) {
  const api = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    proxiedFetcher: makeSimpleProxyFetcher(`${SITE}/api/proxy`, fetch),
    target: env.target,
    consistentIpForRequests: env.consistentIp,
  });

  const tried = [];
  const out = await api
    .runAll({
      media,
      events: {
        start: (id) => tried.push(id),
      },
    })
    .catch((e) => {
      console.log(`  runAll threw: ${e.message}`);
      return null;
    });

  if (!out) {
    console.log(`[${env.key}] nothing playable. tried: ${tried.join(", ")}\n`);
    continue;
  }
  const minutes = await minutesOf(out.stream).catch(() => null);
  console.log(
    `[${env.key}] ${out.sourceId}${out.embedId ? `/${out.embedId}` : ""} → ${
      minutes ? `${minutes.toFixed(1)}min` : "duration unknown"
    }${minutes && expected && (minutes / expected > 1.5 || minutes / expected < 0.6) ? "  WRONG MEDIA" : ""}`,
  );
  console.log(`   tried: ${tried.join(", ")}\n`);
}
