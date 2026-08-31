/**
 * Round-5 godly source hunt — probe competitor APIs + fresh embed domains.
 * Usage: node scripts/source-hunt-r5.mjs
 */
import { createDecipheriv } from "crypto";
import { writeFileSync } from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const TITLES = [
  { title: "Inception", tmdb: 27205, type: "movie", year: 2010 },
  { title: "Dune 2", tmdb: 693134, type: "movie", year: 2024 },
  { title: "Breaking Bad S1E1", tmdb: 1396, type: "tv", season: 1, episode: 1, year: 2008 },
];

function scoreBody(status, text, ct) {
  if (status !== 200 || !text) return 0;
  const t = text.slice(0, 4000);
  let s = 10;
  if (/m3u8|\.mp4|videoUrl|playlist|qualities|stream/i.test(t)) s += 40;
  if (/\"url\"\s*:|src=|file:/i.test(t)) s += 20;
  if (/application\/json|text\/plain|mpegurl/i.test(ct || "")) s += 15;
  if (/<!DOCTYPE|<html/i.test(t) && !/m3u8|\.mp4/i.test(t)) s -= 30;
  if (/just a moment|cf-browser-verification|challenge-platform/i.test(t)) s -= 40;
  if (/for sale|domain is for sale|parked/i.test(t)) s -= 50;
  if (t.length > 200) s += 10;
  if (t.length > 2000) s += 10;
  return Math.max(0, Math.min(100, s));
}

async function probe(id, url, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        "User-Agent": opts.ua || UA,
        Accept: "*/*",
        ...(opts.headers || {}),
      },
      body: opts.body,
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeout || 15000),
    });
    const ct = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    const text = buf.toString("utf8");
    const ms = Date.now() - t0;
    return {
      id,
      url,
      status: r.status,
      ms,
      len: buf.length,
      ct,
      score: scoreBody(r.status, text, ct),
      preview: text.slice(0, 220).replace(/\s+/g, " "),
      ok: r.status === 200 && scoreBody(r.status, text, ct) >= 40,
    };
  } catch (e) {
    return {
      id,
      url,
      status: 0,
      ms: Date.now() - t0,
      len: 0,
      ct: "",
      score: 0,
      preview: e.message,
      ok: false,
    };
  }
}

function movieUrl(tpl, t) {
  return tpl
    .replaceAll("{tmdb}", String(t.tmdb))
    .replaceAll("{season}", String(t.season || 1))
    .replaceAll("{episode}", String(t.episode || 1))
    .replaceAll("{type}", t.type === "tv" ? "tv" : "movie")
    .replaceAll("{imdb}", "tt1375666"); // Inception fallback; only used for imdb templates
}

const TEMPLATES = [
  // Already known strong
  { id: "primesrc-list", tpl: "https://primesrc.me/api/v1/list_servers?type={type}&tmdb={tmdb}" },
  { id: "vidlink-enc", tpl: "https://enc-dec.app/api/vidlink/{type}/{tmdb}" },

  // Astralchemist core/extras embeds (catalog only — need scrape later)
  { id: "vidfast-embed", tpl: "https://vidfast.pro/movie/{tmdb}", only: "movie" },
  { id: "vidfast-tv", tpl: "https://vidfast.pro/tv/{tmdb}/{season}/{episode}", only: "tv" },
  { id: "vidsrc-pm", tpl: "https://vidsrc.pm/embed/{type}/{tmdb}" },
  { id: "2embed-skin", tpl: "https://www.2embed.skin/embed/{type}/{tmdb}" },
  { id: "autoembed-co", tpl: "https://player.autoembed.co/embed/{type}/{tmdb}" },
  { id: "moviesapi-to", tpl: "https://moviesapi.to/movie/{tmdb}", only: "movie" },
  { id: "nontongo", tpl: "https://www.nontongo.win/movie/{tmdb}", only: "movie" },
  { id: "frembed", tpl: "https://frembed.fun/api/films?id={tmdb}", only: "movie" },
  { id: "smashystream", tpl: "https://embed.smashystream.com/{type}/{tmdb}" },

  // Kiduyu / common embeds
  { id: "vidup", tpl: "https://vidup.to/movie/{tmdb}", only: "movie" },
  { id: "vidup-tv", tpl: "https://vidup.to/tv/{tmdb}/{season}/{episode}", only: "tv" },

  // Competitor-family APIs
  { id: "videasy", tpl: "https://player.videasy.net/api/{type}/{tmdb}" },
  { id: "vidzee", tpl: "https://player.vidzee.wtf/api/{type}/{tmdb}" },
  { id: "mp4hydra", tpl: "https://mp4hydra.org/info/{tmdb}" },
  { id: "4khdhub-search", tpl: "https://4khdhub.fans/?s=Inception" },
  { id: "moviesmod", tpl: "https://moviesmod.bot/?s=Inception" },
  { id: "uhdmovies", tpl: "https://uhdmovies.email/?s=Inception" },
  { id: "netmirror", tpl: "https://netfree2.cc/mobile/home" },
  { id: "vidcore", tpl: "https://vidcore.io/embed/movie?tmdb={tmdb}", only: "movie" },
  { id: "streamflix-api", tpl: "https://api.streamflix.app/movies/{tmdb}" },
  { id: "vixsrc", tpl: "https://vixsrc.to/movie/{tmdb}", only: "movie" },
  { id: "vidrock", tpl: "https://vidrock.net/api/movie/{tmdb}", only: "movie" },
  { id: "cinemaos", tpl: "https://cinemaos.vercel.app/api/movie/{tmdb}", only: "movie" },
  { id: "embedsu", tpl: "https://embed.su/api/embed/movie/{tmdb}", only: "movie" },
  { id: "vidsrc-icu", tpl: "https://vidsrc.icu/embed/{type}/{tmdb}" },
  { id: "vidsrc-cc", tpl: "https://vidsrc.cc/v2/embed/{type}/{tmdb}" },
  { id: "multiembed", tpl: "https://multiembed.mov/?video_id={tmdb}&tmdb=1" },
  { id: "vidjoy", tpl: "https://vidjoy.pro/embed/{type}/{tmdb}" },
  { id: "ridomovies", tpl: "https://ridomovies.tv/core/api/search?q=Inception" },
  { id: "flicky", tpl: "https://flicky.host/api/{type}/{tmdb}" },
  { id: "rgshows", tpl: "https://api.rgshows.ru/api/{type}/{tmdb}" },
  { id: "hexagl", tpl: "https://hexagl.xyz/api/{type}/{tmdb}" },
  { id: "vipstream", tpl: "https://vipstream.tv/api/{type}/{tmdb}" },
  { id: "myflixerz", tpl: "https://myflixerz.to/ajax/episode/list/{tmdb}" },
  { id: "flixhq", tpl: "https://flixhq.to/ajax/episode/list/{tmdb}" },
  { id: "hilocinema", tpl: "https://hilocinema.com/api/{type}/{tmdb}" },
  { id: "spencerdevs", tpl: "https://api.spencerdevs.xyz/{type}/{tmdb}" },
  { id: "moviebox", tpl: "https://api.moviebox.ng/wefeed-h5-bff/web/subject/search?keyword=Inception" },
];

async function probeCastle() {
  const CASTLE_BASE = "https://api.hlowb.com";
  const PKG = "com.external.castle";
  const CHANNEL = "IndiaA";
  const CLIENT = "1";
  const LANG = "en-US";
  const headers = {
    "User-Agent": "okhttp/4.9.3",
    Accept: "application/json",
    Referer: CASTLE_BASE,
  };
  function deriveKey(securityKey) {
    const keyBytes = Buffer.from(securityKey, "base64");
    const suffix = Buffer.from("T!BgJB", "utf8");
    const combined = Buffer.concat([keyBytes, suffix]);
    if (combined.length < 16) {
      return Buffer.concat([combined, Buffer.alloc(16 - combined.length, 0)]);
    }
    return combined.subarray(0, 16);
  }
  function decrypt(cipherText, securityKey) {
    const key = deriveKey(securityKey);
    const decipher = createDecipheriv("aes-128-cbc", key, key);
    decipher.setAutoPadding(true);
    return Buffer.concat([
      decipher.update(Buffer.from(cipherText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  function safeParse(text) {
    return JSON.parse(text.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"'));
  }
  async function cipher(res) {
    const text = (await res.text()).trim();
    try {
      const p = JSON.parse(text);
      if (typeof p.data === "string") return p.data.trim();
    } catch {
      /* raw */
    }
    return text;
  }

  try {
    const sec = (await (await fetch(`${CASTLE_BASE}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`, { headers })).json()).data;
    const params = new URLSearchParams({
      channel: CHANNEL,
      clientType: CLIENT,
      keyword: "Inception",
      lang: LANG,
      mode: "1",
      packageName: PKG,
      page: "1",
      size: "30",
    });
    const search = safeParse(decrypt(await cipher(await fetch(`${CASTLE_BASE}/film-api/v1.1.0/movie/searchByKeyword?${params}`, { headers })), sec));
    const data = search?.data && typeof search.data === "object" ? search.data : search;
    const list = data?.rows || data?.list || [];
    const hit = list.find((x) => /inception/i.test(String(x.name || x.title || x.movieName || ""))) || list[0];
    if (!hit) {
      return { id: "castletv", ok: false, score: 20, preview: `sec ok, search empty keys=${Object.keys(search || {}).join(",")}` };
    }
    const movieId = String(hit.movieId ?? hit.id);
    const detail = safeParse(decrypt(await cipher(await fetch(`${CASTLE_BASE}/film-api/v1.9.9/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`, { headers })), sec));
    const d = detail?.data || detail;
    const episodeId = d?.episodes?.[0]?.id != null ? String(d.episodes[0].id) : (d?.episodeList?.[0]?.episodeId || d?.episodeId || movieId);
    const body = {
      mode: "1",
      appMarket: "GuanWang",
      clientType: CLIENT,
      woolUser: "false",
      apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
      androidVersion: "13",
      movieId,
      episodeId,
      isNewUser: "true",
      resolution: "3",
      packageName: PKG,
    };
    const v = safeParse(
      decrypt(
        await cipher(
          await fetch(
            `${CASTLE_BASE}/film-api/v2.0.1/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
            { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) },
          ),
        ),
        sec,
      ),
    );
    const vd = v?.data || v;
    const url = vd?.videoUrl || vd?.videos?.[0]?.url;
    return {
      id: "castletv",
      ok: Boolean(url),
      score: url ? 95 : 35,
      preview: url ? `videoUrl ${String(url).slice(0, 160)}` : JSON.stringify(v).slice(0, 220),
      url,
      searchHit: `${hit.name || hit.title || hit.movieName} id=${movieId}`,
    };
  } catch (e) {
    return { id: "castletv", ok: false, score: 0, preview: e.message };
  }
}

async function probeOneTouch() {
  const AES_KEY = Buffer.from("im72charPasswordofdInitVectorStm", "utf8");
  const AES_IV = Buffer.from("im72charPassword", "utf8");
  function decrypt(encoded) {
    let s = encoded.replace(/-_\./g, "/").replace(/@/g, "+").replace(/\s+/g, "");
    const pad = s.length % 4;
    if (pad !== 0) s += "=".repeat(4 - pad);
    const decipher = createDecipheriv("aes-256-cbc", AES_KEY, AES_IV);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(s, "base64")), decipher.final()]).toString("utf8"));
  }
  async function get(path) {
    const r = await fetch(`https://api3.devcorp.me${path}`, {
      headers: { "User-Agent": UA, Referer: "https://onetouchtv.xyz/" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return decrypt(await r.text());
  }
  try {
    const search = await get("/vod/search?keyword=Inception%202010");
    const list = search.result || [];
    const hit = list.find((x) => /inception/i.test(x.title) && String(x.year) === "2010" && x.type === "movie") || list.find((x) => /inception/i.test(x.title) && x.type === "movie");
    if (!hit) return { id: "onetouchtv", ok: false, score: 25, preview: `search ${list.length} no 2010 match` };
    const detail = (await get(`/vod/${hit.id}/detail`)).result;
    const playId = detail?.episodes?.[0]?.playId;
    if (!playId) return { id: "onetouchtv", ok: false, score: 40, preview: `detail ok id=${hit.id} no playId` };
    try {
      const ep = await get(`/vod/${hit.id}/episode/${playId}`);
      const streams = ep.result || ep;
      const url =
        streams?.url ||
        streams?.playUrl ||
        streams?.[0]?.url ||
        streams?.qualities?.["1080p"]?.url ||
        streams?.sources?.[0]?.url;
      return {
        id: "onetouchtv",
        ok: Boolean(url) || Boolean(streams),
        score: url ? 90 : 55,
        preview: url ? String(url).slice(0, 180) : JSON.stringify(streams).slice(0, 220),
        hit: hit.title,
      };
    } catch (e) {
      return { id: "onetouchtv", ok: false, score: 45, preview: `detail ok (${hit.title}) episode ${e.message}`, hit: hit.title };
    }
  } catch (e) {
    return { id: "onetouchtv", ok: false, score: 0, preview: e.message };
  }
}

async function probeDahmerListing() {
  const url = "https://a.111477.xyz/movies/Inception%20(2010)/";
  const r = await probe("dahmer-listing", url);
  r.note = "listing only; file bytes CF-blocked via proxy; MKV not browser-native";
  return r;
}

const results = [];

console.log("=== Castle / OneTouch / Dahmer ===");
results.push(await probeCastle());
results.push(await probeOneTouch());
results.push(await probeDahmerListing());
for (const r of results) {
  console.log(`${r.ok ? "HIT" : "miss"} ${r.id} score=${r.score} | ${r.preview}`);
}

console.log("\n=== Template matrix ===");
const matrix = [];
for (const t of TITLES) {
  for (const tmpl of TEMPLATES) {
    if (tmpl.only && tmpl.only !== t.type) continue;
    if (tmpl.tpl.includes("Inception") && t.title !== "Inception") continue;
    const url = movieUrl(tmpl.tpl, t);
    const r = await probe(`${tmpl.id}:${t.title}`, url);
    matrix.push({ ...r, template: tmpl.id, title: t.title });
    if (r.score >= 50) console.log(`HIT ${tmpl.id} ${t.title} ${r.status} ${r.score} ${r.preview.slice(0, 100)}`);
  }
}

const byId = new Map();
for (const r of matrix) {
  const prev = byId.get(r.template) || { id: r.template, hits: 0, tries: 0, maxScore: 0, samples: [] };
  prev.tries++;
  if (r.ok) prev.hits++;
  prev.maxScore = Math.max(prev.maxScore, r.score);
  if (prev.samples.length < 2) prev.samples.push({ title: r.title, status: r.status, score: r.score, preview: r.preview });
  byId.set(r.template, prev);
}

const summary = [...byId.values()].sort((a, b) => b.maxScore - a.maxScore || b.hits - a.hits);
const special = results;
const out = {
  at: new Date().toISOString(),
  special,
  summary,
  qualify: summary.filter((s) => s.maxScore >= 60 || s.hits > 0),
};
writeFileSync(new URL("./source-hunt-r5-results.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("\n=== Top candidates ===");
for (const s of summary.slice(0, 15)) {
  console.log(`${s.id} max=${s.maxScore} hits=${s.hits}/${s.tries}`);
}
console.log("Wrote scripts/source-hunt-r5-results.json");
