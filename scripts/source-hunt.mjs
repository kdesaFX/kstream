#!/usr/bin/env node
/**
 * Systematic source discovery: probe candidate TMDB JSON/HLS APIs through
 * kdesa.stream proxy, validate responses, detect stub/fake playlists.
 *
 *   node scripts/source-hunt.mjs
 *   node scripts/source-hunt.mjs --quick
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUICK = process.argv.includes("--quick");
const SITE = process.env.SOURCE_HUNT_PROXY_ORIGIN || "https://kdesa.stream";
const PROXY = `${SITE}/api/proxy?destination=`;

const TITLES = QUICK
  ? [
      { label: "Inception", movie: 27205, show: null },
      { label: "Breaking Bad S1E1", movie: null, show: [1396, 1, 1] },
    ]
  : [
      { label: "Inception", movie: 27205, show: null },
      { label: "Dune 2", movie: 693134, show: null },
      { label: "Dark Knight", movie: 155, show: null },
      { label: "Breaking Bad S1E1", movie: null, show: [1396, 1, 1] },
      { label: "Stranger Things S1E1", movie: null, show: [66732, 1, 1] },
    ];

/** @type {Array<{ id: string; build: (t: typeof TITLES[0]) => string | null; headers?: Record<string,string> }>} */
const CANDIDATES = [
  {
    id: "cornclick",
    build: (t) =>
      t.movie
        ? `https://cornclick.com/player/movie/${t.movie}`
        : `https://cornclick.com/player/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "nova",
    build: (t) =>
      t.movie
        ? `https://novahd.cc/api/sources?type=movie&tmdbId=${t.movie}`
        : `https://novahd.cc/api/sources?type=tv&tmdbId=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`,
    headers: {
      Referer: "https://novahd.cc/",
      Origin: "https://novahd.cc",
    },
  },
  {
    id: "dulo-sources",
    build: (t) =>
      t.movie
        ? `https://dulo.cx/api/sources?type=movie&tmdbId=${t.movie}`
        : `https://dulo.cx/api/sources?type=tv&tmdbId=${t.show[0]}&season=${t.show[1]}&episode=${t.show[2]}`,
    headers: { Referer: "https://dulo.cx/", Origin: "https://dulo.cx" },
  },
  {
    id: "showby",
    build: (t) =>
      t.movie
        ? `https://showby.to/player/movie/${t.movie}`
        : `https://showby.to/player/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidspark",
    build: (t) =>
      t.movie
        ? `https://vidspark.to/api/vidora/v1/movie/${t.movie}`
        : null,
  },
  {
    id: "moviesapi-discover",
    build: (t) =>
      t.movie
        ? `https://moviesapi.club/api/discover/movie/${t.movie}`
        : `https://moviesapi.club/api/discover/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "embedsu-api",
    build: (t) =>
      t.movie
        ? `https://embed.su/api/e/movie/${t.movie}`
        : `https://embed.su/api/e/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "vidsrc-rip",
    build: (t) =>
      t.movie
        ? `https://vidsrc.rip/api/source/${t.movie}`
        : `https://vidsrc.rip/api/source/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "2embed-api",
    build: (t) =>
      t.movie
        ? `https://www.2embed.cc/embed/${t.movie}`
        : `https://www.2embed.cc/embed/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "autoembed-api",
    build: (t) =>
      t.movie
        ? `https://autoembed.co/e/movie/${t.movie}`
        : `https://autoembed.co/e/tv/${t.show[0]}/${t.show[1]}/${t.show[2]}`,
  },
  {
    id: "ridomovies-search",
    build: () => `https://ridomovies.tv/core/api/search?q=inception`,
  },
  {
    id: "reyna-challenge",
    build: () => `https://api.reallyfast.xyz/api/challenge`,
    headers: {
      Referer: "https://goated.cx/",
      Origin: "https://goated.cx",
    },
  },
  {
    id: "enc-dec-vidlink",
    build: async (t) => {
      const id = t.movie ? String(t.movie) : `${t.show[0]}`;
      const enc = await fetch(
        `${PROXY}${encodeURIComponent(`https://enc-dec.app/api/enc-vidlink?text=${id}`)}`,
        { signal: AbortSignal.timeout(12000) },
      ).then((r) => r.json()).catch(() => null);
      if (!enc?.result) return null;
      return t.movie
        ? `https://vidlink.pro/api/b/movie/${enc.result}`
        : `https://vidlink.pro/api/b/tv/${enc.result}/${t.show[1]}/${t.show[2]}`;
    },
  },
  {
    id: "enc-dec-videasy",
    build: async (t) => {
      const id = t.movie ? String(t.movie) : `${t.show[0]}`;
      const enc = await fetch(
        `${PROXY}${encodeURIComponent(`https://enc-dec.app/api/enc-videasy?text=${id}`)}`,
        { signal: AbortSignal.timeout(12000) },
      ).then((r) => r.json()).catch(() => null);
      if (!enc?.result) return null;
      return t.movie
        ? `https://player.videasy.net/api/movie/${enc.result}`
        : `https://player.videasy.net/api/tv/${enc.result}/${t.show[1]}/${t.show[2]}`;
    },
  },
];

function extractUrls(text) {
  const urls = [];
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m;
  while ((m = re.exec(text))) {
    let u = m[0].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    u = u.replace(/[),.;]+$/, "");
    urls.push(u);
  }
  return [...new Set(urls)];
}

function scoreResponse(text) {
  const lower = text.toLowerCase();
  let score = 0;
  if (lower.includes("#extm3u")) score += 50;
  if (/\.m3u8/i.test(text)) score += 30;
  if (/"sources"\s*:/.test(text)) score += 20;
  if (/"qualities"\s*:/.test(text)) score += 20;
  if (/"stream"\s*:/.test(text)) score += 15;
  if (/1080|2160|4k/i.test(text)) score += 10;
  if (/720/i.test(text)) score += 5;
  if (/session_required|too_many|cloudflare|just a moment|1016/i.test(text))
    score -= 40;
  if (text.length < 80) score -= 10;
  return score;
}

async function probeUrl(name, url, headers = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${PROXY}${encodeURIComponent(url)}`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...headers,
      },
      signal: AbortSignal.timeout(18000),
    });
    const text = await r.text();
    const ms = Date.now() - t0;
    const urls = extractUrls(text);
    const m3u8 = urls.filter((u) => /\.m3u8/i.test(u) || u.includes("m3u8"));
    return {
      name,
      url,
      status: r.status,
      ms,
      len: text.length,
      score: scoreResponse(text),
      m3u8Count: m3u8.length,
      sampleM3u8: m3u8[0]?.slice(0, 120) ?? null,
      preview: text.slice(0, 180).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { name, url, error: e.message, ms: Date.now() - t0 };
  }
}

async function main() {
  const results = [];
  console.log(`Source hunt via ${SITE} (${QUICK ? "quick" : "full"})…\n`);

  for (const cand of CANDIDATES) {
    const perTitle = [];
    for (const title of TITLES) {
      let built = cand.build(title);
      if (typeof built?.then === "function") built = await built;
      if (!built) continue;
      const res = await probeUrl(
        `${cand.id}:${title.label}`,
        built,
        cand.headers,
      );
      perTitle.push({ title: title.label, ...res });
    }

    const hits = perTitle.filter((r) => r.score >= 25 && !r.error);
    const m3u8Sets = hits.map((h) => h.sampleM3u8).filter(Boolean);
    const uniqueM3u8 = new Set(m3u8Sets);
    const stubSuspect =
      uniqueM3u8.size === 1 && hits.length >= 2 && m3u8Sets.length >= 2;

    const summary = {
      id: cand.id,
      hits: hits.length,
      tries: perTitle.length,
      avgMs: hits.length
        ? Math.round(hits.reduce((a, h) => a + h.ms, 0) / hits.length)
        : null,
      maxScore: Math.max(0, ...perTitle.map((r) => r.score ?? 0)),
      stubSuspect,
      qualify: hits.length >= Math.min(2, TITLES.length) && !stubSuspect,
      samples: perTitle,
    };
    results.push(summary);

    const flag = summary.qualify
      ? "✅ QUALIFY"
      : summary.maxScore >= 15
        ? "⚠️  partial"
        : "❌ miss";
    console.log(
      `${flag} ${cand.id.padEnd(22)} hits=${summary.hits}/${summary.tries} score=${summary.maxScore} avgMs=${summary.avgMs ?? "-"}${stubSuspect ? " STUB?" : ""}`,
    );
  }

  const qualified = results.filter((r) => r.qualify);
  console.log(`\n=== QUALIFIED (${qualified.length}) ===`);
  for (const q of qualified) {
    console.log(`  • ${q.id} (${q.hits} hits, ~${q.avgMs}ms)`);
  }

  const out = path.join(__dirname, "source-hunt-results.json");
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
