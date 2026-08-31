import { createDecipheriv } from "crypto";

const CASTLE_BASE = "https://api.hlowb.com";
const PKG = "com.external.castle";
const CHANNEL = "IndiaA";
const CLIENT = "1";
const LANG = "en-US";
const API_HEADERS = {
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

function decryptCastle(cipherText, securityKey) {
  const key = deriveKey(securityKey);
  const decipher = createDecipheriv("aes-128-cbc", key, key);
  decipher.setAutoPadding(true);
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function castleSafeParse(text) {
  const safe = text.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"');
  return JSON.parse(safe);
}

async function extractCipher(res) {
  const text = await res.text();
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.data && typeof parsed.data === "string") return parsed.data.trim();
  } catch {
    /* raw */
  }
  return trimmed;
}

async function castleProbe() {
  console.log("\n=== CastleTV ===");
  const secRes = await fetch(
    `${CASTLE_BASE}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`,
    { headers: API_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  const secJson = await secRes.json();
  const securityKey = secJson.data;
  console.log("securityKey ok", typeof securityKey === "string");

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
  const searchRes = await fetch(
    `${CASTLE_BASE}/film-api/v1.1.0/movie/searchByKeyword?${params}`,
    { headers: API_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  const cipher = await extractCipher(searchRes);
  const searchRaw = decryptCastle(cipher, securityKey);
  const search = castleSafeParse(searchRaw);
  console.log("search raw keys", Object.keys(search || {}), JSON.stringify(search).slice(0, 500));
  const list =
    search?.data?.list ||
    search?.list ||
    search?.data?.movieList ||
    search?.data?.records ||
    (Array.isArray(search?.data) ? search.data : []);
  console.log("search count", Array.isArray(list) ? list.length : 0);
  const first = Array.isArray(list)
    ? list.find((x) => /inception/i.test(String(x.name || x.title || x.movieName || ""))) || list[0]
    : null;
  console.log("first", JSON.stringify(first)?.slice(0, 500));
  if (!first) return;

  const movieId = first.movieId ?? first.id;
  const detailRes = await fetch(
    `${CASTLE_BASE}/film-api/v1.9.9/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`,
    { headers: API_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  const detailRaw = decryptCastle(await extractCipher(detailRes), securityKey);
  const detail = castleSafeParse(detailRaw);
  const d = detail?.data && typeof detail.data === "object" ? detail.data : detail;
  console.log("detail sample", JSON.stringify(detail).slice(0, 1200));

  const episodeId =
    d?.episodeId ||
    d?.episodes?.[0]?.episodeId ||
    d?.episodeList?.[0]?.episodeId ||
    d?.movieEpisodeList?.[0]?.episodeId ||
    first.episodeId ||
    movieId;
  const languageId =
    d?.languages?.[0]?.languageId ||
    d?.languageList?.[0]?.languageId ||
    d?.subtitleLanguages?.[0]?.languageId;

  console.log("movieId", movieId, "episodeId", episodeId, "languageId", languageId);

  for (const resolution of [3, 2, 1]) {
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
      resolution: String(resolution),
      packageName: PKG,
      ...(languageId != null ? { languageId } : {}),
    };
    const url = `${CASTLE_BASE}/film-api/v2.0.1/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`;
    const vRes = await fetch(url, {
      method: "POST",
      headers: { ...API_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    try {
      const vRaw = decryptCastle(await extractCipher(vRes), securityKey);
      const v = castleSafeParse(vRaw);
      const vd = v?.data && typeof v.data === "object" ? v.data : v;
      const videoUrl = vd?.videoUrl || vd?.videos?.[0]?.url;
      console.log(
        `res ${resolution}`,
        videoUrl ? `URL ${String(videoUrl).slice(0, 120)}` : JSON.stringify(v).slice(0, 300),
      );
      if (videoUrl) {
        const head = await fetch(videoUrl, {
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(10000),
        }).catch((e) => ({ status: "err", message: e.message }));
        console.log("playback HEAD", head.status || head, head.headers?.get?.("content-type"));
        break;
      }
    } catch (e) {
      console.log(`res ${resolution} ERR`, e.message, "http", vRes.status);
    }
  }
}

function otDecrypt(encoded) {
  const AES_KEY = Buffer.from("im72charPasswordofdInitVectorStm", "utf8");
  const AES_IV = Buffer.from("im72charPassword", "utf8");
  let s = encoded.replace(/-_\./g, "/").replace(/@/g, "+").replace(/\s+/g, "");
  const pad = s.length % 4;
  if (pad !== 0) s += "=".repeat(4 - pad);
  const buf = Buffer.from(s, "base64");
  const decipher = createDecipheriv("aes-256-cbc", AES_KEY, AES_IV);
  return JSON.parse(Buffer.concat([decipher.update(buf), decipher.final()]).toString("utf8"));
}

async function otFetch(path) {
  const url = path.startsWith("http") ? path : `https://api3.devcorp.me${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://onetouchtv.xyz/",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return otDecrypt(await res.text());
}

async function onetouchProbe() {
  console.log("\n=== OneTouchTV ===");
  const search = await otFetch("/vod/search?keyword=Inception");
  const results = search.result || search.data || [];
  console.log("search type", typeof results, Array.isArray(results) ? results.length : Object.keys(search));
  console.log("search sample", JSON.stringify(search).slice(0, 800));
  const list = Array.isArray(results) ? results : results?.list || [];
  const hit =
    list.find((x) => /inception/i.test(String(x.name || x.title || x.vod_name || ""))) ||
    list[0];
  if (!hit) {
    console.log("no hit");
    return;
  }
  console.log("hit", JSON.stringify(hit).slice(0, 400));
  const id = hit.id ?? hit.vod_id;
  const detail = await otFetch(`/vod/${id}/detail`);
  console.log("detail", JSON.stringify(detail).slice(0, 1200));
  const d = detail.result || detail.data || detail;
  const playId =
    d?.playId ||
    d?.episodes?.[0]?.playId ||
    d?.episodes?.[0]?.id ||
    d?.play_list?.[0]?.playId ||
    d?.list?.[0]?.playId ||
    d?.sources?.[0]?.id;
  console.log("playId guess", playId);
  if (playId != null) {
    const ep = await otFetch(`/vod/${id}/episode/${playId}`);
    console.log("episode", JSON.stringify(ep).slice(0, 1200));
  }
}

await castleProbe().catch((e) => console.log("castle ERR", e.message));
await onetouchProbe().catch((e) => console.log("onetouch ERR", e.message));
