/**
 * Wrong-media hunt: scrape one title from every source, then measure what each
 * returned stream actually is (playlist duration, variant count, host). A
 * duration that misses the episode's runtime by a wide margin means the source
 * matched the wrong title.
 *
 * Usage:
 *   node scripts/goon-wrongmedia.mjs --tv 86836 --season 1 --episode 1
 *   node scripts/goon-wrongmedia.mjs --movie 675445
 *   node scripts/goon-wrongmedia.mjs --tv 86836 --season 1 --episode 1 --only reyna,tqq
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const providers = require(
  process.env.GOON_PROVIDERS_PATH || "@p-stream/providers",
);
const {
  makeProviders,
  makeStandardFetcher,
  makeSimpleProxyFetcher,
  setM3U8ProxyUrl,
  targets,
} = providers;

const SITE = "https://kdesa.stream";
const PROXY = `${SITE}/api/proxy`;
setM3U8ProxyUrl(`${SITE}/api`);

const TMDB = "https://api.themoviedb.org/3";
const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjYTg3NmZkYmVhMjNhMzI3ODY0ZjRjN2U5MzMwZTYxNiIsIm5iZiI6MTc4MjIwOTQ0NC45OTksInN1YiI6IjZhM2E1YmE0ZmMzZGFiNGNmYzMzNjIxMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WlSOswQDdxdbKu0jARJoruV6PlteoTXB1Oj4gRaibBI";

const SOURCE_TIMEOUT_MS = 40_000;
const CONCURRENCY = 4;

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const tvId = arg("tv");
const movieId = arg("movie");
const seasonNumber = Number(arg("season", "1"));
const episodeNumber = Number(arg("episode", "1"));
const only = (arg("only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function tmdb(p) {
  const res = await fetch(`${TMDB}${p}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${p}`);
  return res.json();
}

async function buildMedia() {
  if (movieId) {
    const m = await tmdb(`/movie/${movieId}`);
    return {
      media: {
        type: "movie",
        title: m.title,
        releaseYear: Number((m.release_date || "0").slice(0, 4)) || 0,
        tmdbId: String(movieId),
        imdbId: m.imdb_id || undefined,
      },
      expectedMinutes: m.runtime ?? null,
      label: `${m.title} (${(m.release_date || "").slice(0, 4)})`,
    };
  }
  const show = await tmdb(`/tv/${tvId}`);
  const season = await tmdb(`/tv/${tvId}/season/${seasonNumber}`);
  const ep =
    (season.episodes || []).find((e) => e.episode_number === episodeNumber) ||
    (season.episodes || [])[0];
  return {
    media: {
      type: "show",
      title: show.name,
      releaseYear: Number((show.first_air_date || "0").slice(0, 4)) || 0,
      tmdbId: String(tvId),
      season: {
        number: seasonNumber,
        tmdbId: String(season.id),
        title: season.name,
      },
      episode: {
        number: ep.episode_number,
        tmdbId: String(ep.id),
        title: ep.name,
      },
    },
    expectedMinutes: ep.runtime ?? show.episode_run_time?.[0] ?? null,
    label: `${show.name} S${seasonNumber}E${episodeNumber} "${ep.name}"`,
  };
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
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
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

function playlistSeconds(text) {
  let total = 0;
  for (const line of text.split("\n")) {
    const m = /^#EXTINF:([\d.]+)/.exec(line.trim());
    if (m) total += Number(m[1]);
  }
  return total;
}

function firstVariantUrl(text, baseUrl) {
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
      const next = lines[i + 1];
      if (next && !next.startsWith("#")) {
        try {
          return new URL(next, baseUrl).href;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Follow a master playlist one hop so we can total real segment durations. */
async function measureStream(stream) {
  const headers = { ...(stream.headers ?? {}), ...(stream.preferredHeaders ?? {}) };
  if (stream.type === "file") {
    const qualities = Object.entries(stream.qualities ?? {});
    const [quality, file] = qualities[0] ?? [];
    if (!file) return { kind: "file", note: "no qualities" };
    try {
      const res = await fetch(file.url, { method: "HEAD", headers });
      return {
        kind: "file",
        quality,
        url: file.url,
        status: res.status,
        bytes: Number(res.headers.get("content-length")) || null,
      };
    } catch (e) {
      return { kind: "file", quality, url: file.url, error: String(e.message) };
    }
  }

  try {
    const res = await fetch(stream.playlist, { headers });
    const text = await res.text();
    if (!text.startsWith("#EXTM3U")) {
      return {
        kind: "hls",
        url: stream.playlist,
        status: res.status,
        note: `not a playlist: ${text.slice(0, 60).replace(/\s+/g, " ")}`,
      };
    }
    let seconds = playlistSeconds(text);
    let variantUrl = null;
    if (seconds === 0) {
      variantUrl = firstVariantUrl(text, res.url || stream.playlist);
      if (variantUrl) {
        const inner = await fetch(variantUrl, { headers });
        seconds = playlistSeconds(await inner.text());
      }
    }
    return {
      kind: "hls",
      url: stream.playlist,
      status: res.status,
      variantUrl,
      seconds: Math.round(seconds),
    };
  } catch (e) {
    return { kind: "hls", url: stream.playlist, error: String(e.message) };
  }
}

function verdict(measurement, expectedMinutes) {
  if (!measurement || measurement.error) return "unmeasured";
  if (measurement.kind === "file") return "unmeasured (mp4)";
  if (!measurement.seconds) return "unmeasured";
  if (!expectedMinutes) return `${Math.round(measurement.seconds / 60)}min`;
  const minutes = measurement.seconds / 60;
  const ratio = minutes / expectedMinutes;
  const tag =
    ratio > 1.4 || ratio < 0.6
      ? "WRONG MEDIA?"
      : "plausible";
  return `${minutes.toFixed(1)}min vs ${expectedMinutes}min → ${tag}`;
}

async function main() {
  if (!tvId && !movieId) {
    console.error("Pass --tv <id> [--season n --episode n] or --movie <id>");
    process.exit(1);
  }

  const { media, expectedMinutes, label } = await buildMedia();
  console.log(`Target: ${label}`);
  console.log(`Expected runtime: ${expectedMinutes ?? "unknown"} min\n`);

  const envs = [
    { key: "browser", target: targets.BROWSER, consistentIp: false },
    {
      key: "extension",
      target: targets.BROWSER_EXTENSION,
      consistentIp: true,
    },
  ];

  for (const env of envs) {
    const api = makeProviders({
      fetcher: makeStandardFetcher(fetch),
      proxiedFetcher: makeSimpleProxyFetcher(PROXY, fetch),
      target: env.target,
      consistentIpForRequests: env.consistentIp,
    });
    const sources = api
      .listSources()
      .filter((s) => !s.disabled)
      .filter((s) => !only.length || only.includes(s.id))
      .filter((s) => !s.mediaTypes?.length || s.mediaTypes.includes(media.type));

    console.log(`=== env=${env.key} (${sources.length} sources) ===`);

    const rows = await mapPool(sources, CONCURRENCY, async (source) => {
      const started = Date.now();
      try {
        const out = await withTimeout(
          api.runSourceScraper({ id: source.id, media }),
          SOURCE_TIMEOUT_MS,
          source.id,
        );
        const streams = out?.stream ?? [];
        if (!streams.length) {
          return {
            id: source.id,
            ms: Date.now() - started,
            note: out?.embeds?.length
              ? `embeds only (${out.embeds.map((e) => e.embedId).join(",")})`
              : "no streams",
          };
        }
        const measurement = await measureStream(streams[0]);
        return {
          id: source.id,
          ms: Date.now() - started,
          measurement,
          note: verdict(measurement, expectedMinutes),
        };
      } catch (err) {
        return {
          id: source.id,
          ms: Date.now() - started,
          note: `fail: ${String(err?.message || err).slice(0, 90)}`,
        };
      }
    });

    const showUrls = process.argv.includes("--urls");
    for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
      const host = row.measurement?.url
        ? new URL(row.measurement.url).host
        : "";
      const flag = /WRONG MEDIA/.test(row.note ?? "") ? " <<<<<<" : "";
      console.log(
        `  ${row.id.padEnd(16)} ${String(row.ms).padStart(6)}ms  ${row.note}  ${host}${flag}`,
      );
      if (showUrls && row.measurement?.url) {
        console.log(`      playlist: ${row.measurement.url}`);
        if (row.measurement.variantUrl) {
          console.log(`      variant:  ${row.measurement.variantUrl}`);
        }
      }
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
