#!/usr/bin/env node
/**
 * Round-3 "godly" hunt: fresh hosts + dormant scrapers + nova TV param variants.
 *   node scripts/source-hunt-godly.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SOURCE_HUNT_PROXY_ORIGIN || "https://kdesa.stream";
const PROXY = `${SITE}/api/proxy?destination=`;

const TITLES = [
  { label: "Inception", movie: 27205, imdb: "tt1375666", show: null },
  { label: "Dune 2", movie: 693134, imdb: "tt15239678", show: null },
  { label: "Breaking Bad S1E1", movie: null, imdb: "tt0903747", show: [1396, 1, 1] },
];

/** @type {Array<{ id: string; build: (t: typeof TITLES[0]) => string | null; headers?: Record<string,string> }>} */
const CANDIDATES = [
  // --- dormant / known scrapers ---
  {
    id: "vidapi-click",
    build: (t) =>
      t.movie
        ? `https://vidapi.click/api/video/movie/${t.movie}`
        : `https://vidapi.click/api/video/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "streambox-vidjoy",
    build: (t) =>
      t.movie
        ? `https://vidjoy.pro/embed/api/fastfetch/${t.movie}?sr=0`
        : `https://vidjoy.pro/embed/api/fastfetch/${t.show[0]}/${t.show[1]}/${t.show[2]}?sr=0`,
  },
  {
    id: "slidemovies-worker",
    build: (t) =>
      t.movie
        ? `https://pupp.slidemovies-dev.workers.dev/movie/${t.movie}`
        : `https://pupp.slidemovies-dev.workers.dev/tv/${t.show[0]}/${t.show[1]}/-${t.show[2]}`,
  },
  {
    id: "primesrc-servers",
    build: (t) =>
      t.movie
        ? `https://primesrc.me/api/v1/s?tmdb=${t.movie}&type=movie`
        : `https://primesrc.me/api/v1/s?tmdb=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}&type=tv`,
  },
  {
    id: "vidrock-movie",
    build: (t) =>
      t.movie
        ? `https://vidrock.net/api/movie/${t.movie}`
        : `https://vidrock.net/api/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  // --- nova TV param matrix ---
  {
    id: "nova-type-tv",
    build: (t) =>
      t.show
        ? `https://novahd.cc/api/sources?type=tv&tmdbId=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`
        : null,
    headers: { Referer: "https://novahd.cc/", Origin: "https://novahd.cc" },
  },
  {
    id: "nova-type-series",
    build: (t) =>
      t.show
        ? `https://novahd.cc/api/sources?type=series&tmdbId=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`
        : null,
    headers: { Referer: "https://novahd.cc/", Origin: "https://novahd.cc" },
  },
  {
    id: "nova-type-episode",
    build: (t) =>
      t.show
        ? `https://novahd.cc/api/sources?type=episode&tmdbId=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`
        : null,
    headers: { Referer: "https://novahd.cc/", Origin: "https://novahd.cc" },
  },
  // --- fresh / rumored JSON hosts ---
  {
    id: "vidsrc-cc-embed",
    build: (t) =>
      t.movie
        ? `https://vidsrc.cc/v2/embed/movie/${t.movie}`
        : `https://vidsrc.cc/v2/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidsrc-net-embed",
    build: (t) =>
      t.movie
        ? `https://vidsrc.net/embed/movie?tmdb=${t.movie}`
        : `https://vidsrc.net/embed/tv?tmdb=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`,
  },
  {
    id: "smashystream",
    build: (t) =>
      t.movie
        ? `https://player.smashy.stream/movie/${t.movie}`
        : `https://player.smashy.stream/tv/${t.show[0]}?s=${t.show[1]}&e=${t.show[2]}`,
  },
  {
    id: "smashy-api",
    build: (t) =>
      t.movie
        ? `https://embed.smashystream.com/dataa.php?imdb=${t.imdb}`
        : `https://embed.smashystream.com/dataa.php?imdb=${t.imdb}&season=${t.show[1]}&episode=${t.show[2]}`,
  },
  {
    id: "111movies",
    build: (t) =>
      t.movie
        ? `https://111movies.com/movie/${t.movie}`
        : `https://111movies.com/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "cinemaos-api",
    build: (t) =>
      t.movie
        ? `https://cinemaos.online/api/sources/${t.movie}`
        : `https://cinemaos.online/api/sources/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "moviebox-api",
    build: (t) =>
      t.movie
        ? `https://api.moviebox.ng/api/v1/stream?tmdb=${t.movie}&type=movie`
        : `https://api.moviebox.ng/api/v1/stream?tmdb=${t.show[0]}&type=tv&s=${t.show[1]}&e=${t.show[2]}`,
  },
  {
    id: "hexared-api",
    build: (t) =>
      t.movie
        ? `https://hexared.com/api/sources?id=${t.movie}&type=movie`
        : `https://hexared.com/api/sources?id=${t.show[0]}&type=tv&season=${t.show[1]}&episode=${t.show[2]}`,
  },
  {
    id: "vidzee-api",
    build: (t) =>
      t.movie
        ? `https://vidzee.wtf/api/movie/${t.movie}`
        : `https://vidzee.wtf/api/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "flicky-api",
    build: (t) =>
      t.movie
        ? `https://flicky.host/api/stream?tmdb=${t.movie}&type=movie`
        : `https://flicky.host/api/stream?tmdb=${t.show[0]}&type=tv&season=${t.show[1]}&episode=${t.show[2]}`,
  },
  {
    id: "vidora-api",
    build: (t) =>
      t.movie
        ? `https://vidora.su/api/sources?tmdb=${t.movie}&type=movie`
        : `https://vidora.su/api/sources?tmdb=${t.show[0]}&type=tv&s=${t.show[1]}&e=${t.show[2]}`,
  },
  {
    id: "rgshows-api",
    build: (t) =>
      t.movie
        ? `https://api.rgshows.me/api/v1/movie/${t.movie}`
        : `https://api.rgshows.me/api/v1/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "spenflix",
    build: (t) =>
      t.movie
        ? `https://api.spenflix.com/movie/${t.movie}`
        : `https://api.spenflix.com/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidfast-api",
    build: (t) =>
      t.movie
        ? `https://vidfast.pro/api/movie/${t.movie}`
        : `https://vidfast.pro/api/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidlink-enc",
    build: (t) =>
      t.movie
        ? `https://vidlink.pro/api/movie/${t.movie}`
        : `https://vidlink.pro/api/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidsrc-vip-api",
    build: (t) =>
      t.movie
        ? `https://vidsrc.vip/embed/movie/${t.movie}`
        : `https://vidsrc.vip/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "embed-su-json",
    build: (t) =>
      t.movie
        ? `https://embed.su/api/embed/movie/${t.movie}`
        : `https://embed.su/api/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "autoembed-json",
    build: (t) =>
      t.movie
        ? `https://player.autoembed.cc/embed/movie/${t.movie}?server=1`
        : `https://player.autoembed.cc/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}?server=1`,
  },
  {
    id: "2embed-json",
    build: (t) =>
      t.movie
        ? `https://www.2embed.skin/embed/${t.imdb}`
        : `https://www.2embed.skin/embedtv/${t.imdb}&s=${t.show?.[1]}&e=${t.show?.[2]}`,
  },
  {
    id: "superembed",
    build: (t) =>
      t.movie
        ? `https://multiembed.mov/?video_id=${t.imdb}`
        : `https://multiembed.mov/?video_id=${t.imdb}&s=${t.show[1]}&e=${t.show[2]}`,
  },
  {
    id: "frembed",
    build: (t) =>
      t.movie
        ? `https://frembed.fun/api/film.php?id=${t.movie}`
        : `https://frembed.fun/api/serie.php?id=${t.show[0]}&sa=${t.show[1]}&epi=${t.show[2]}`,
  },
  {
    id: "vidsrc-icu",
    build: (t) =>
      t.movie
        ? `https://vidsrc.icu/embed/movie/${t.movie}`
        : `https://vidsrc.icu/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "moviesapi-v2",
    build: (t) =>
      t.movie
        ? `https://moviesapi.club/movie/${t.movie}`
        : `https://moviesapi.club/tv/${t.show[0]}-${t.show[1]}-${t.show[2]}`,
  },
  {
    id: "showbox-json",
    build: (t) =>
      t.movie
        ? `https://www.showbox.media/api/movie/detail?subjectId=${t.movie}`
        : null,
  },
];

function scoreBody(text, status) {
  if (status < 200 || status >= 400) return -10;
  const lower = text.toLowerCase();
  if (/cloudflare|attention required|cf-ray|just a moment|challenge-platform/.test(lower))
    return -5;
  if (/session_required|turnstile|captcha/.test(lower)) return -3;
  let score = 0;
  if (/"m3u8"|m3u8|\.mp4|hls|playlist|sources|streams|qualities/.test(lower)) score += 40;
  if (/1080|2160|4k|uhd|720/.test(lower)) score += 20;
  if (/\{[\s\S]*"/.test(text.slice(0, 200)) || text.trimStart().startsWith("[")) score += 15;
  if (text.length > 500) score += 5;
  if (text.length > 5000) score += 5;
  const m3u8 = [...text.matchAll(/https?:\/\/[^"'\\\s>]+\.m3u8[^"'\\\s>]*/gi)].map((m) => m[0]);
  const mp4 = [...text.matchAll(/https?:\/\/[^"'\\\s>]+\.mp4[^"'\\\s>]*/gi)].map((m) => m[0]);
  if (m3u8.length) score += 25;
  if (mp4.length) score += 20;
  return { score, m3u8: m3u8.slice(0, 2), mp4: mp4.slice(0, 2) };
}

async function probe(url, headers = {}) {
  const dest = PROXY + encodeURIComponent(url);
  const t0 = Date.now();
  try {
    const res = await fetch(dest, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...headers,
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    const scored = scoreBody(text, res.status);
    const score = typeof scored === "number" ? scored : scored.score;
    return {
      status: res.status,
      ms: Date.now() - t0,
      len: text.length,
      score,
      m3u8: typeof scored === "object" ? scored.m3u8 : [],
      mp4: typeof scored === "object" ? scored.mp4 : [],
      preview: text.slice(0, 220).replace(/\s+/g, " "),
    };
  } catch (e) {
    return {
      status: 0,
      ms: Date.now() - t0,
      len: 0,
      score: -20,
      m3u8: [],
      mp4: [],
      preview: String(e.message || e),
    };
  }
}

const summary = [];
for (const c of CANDIDATES) {
  const samples = [];
  for (const t of TITLES) {
    const url = c.build(t);
    if (!url) continue;
    const r = await probe(url, c.headers);
    samples.push({ title: t.label, url, ...r });
    process.stdout.write(
      `${c.id.padEnd(22)} ${t.label.padEnd(20)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms score=${r.score}\n`,
    );
  }
  const hits = samples.filter((s) => s.score >= 40);
  const maxScore = Math.max(0, ...samples.map((s) => s.score));
  const avgMs =
    hits.length > 0
      ? Math.round(hits.reduce((a, s) => a + s.ms, 0) / hits.length)
      : null;
  summary.push({
    id: c.id,
    hits: hits.length,
    tries: samples.length,
    avgMs,
    maxScore,
    qualify: hits.length >= 1 && maxScore >= 50,
    samples,
  });
}

summary.sort((a, b) => b.maxScore - a.maxScore || b.hits - a.hits);
const out = path.join(__dirname, "source-hunt-godly-results.json");
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2));

console.log("\n=== QUALIFY / LEADERS ===");
for (const s of summary.filter((x) => x.qualify || x.maxScore >= 40)) {
  console.log(
    `${s.qualify ? "YES" : "maybe"}  ${s.id}  hits=${s.hits}/${s.tries}  max=${s.maxScore}  avgMs=${s.avgMs}`,
  );
}
console.log(`\nWrote ${out}`);
