import { createDecipheriv } from "crypto";
import { writeFileSync } from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

async function headOk(url, headers = {}) {
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Range: "bytes=0-200", ...headers },
      signal: AbortSignal.timeout(12000),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const text = buf.toString("utf8");
    return {
      status: r.status,
      ct: r.headers.get("content-type"),
      len: buf.length,
      isM3u8: /#EXTM3U|m3u8/i.test(text) || /mpegurl/i.test(r.headers.get("content-type") || ""),
      preview: text.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function validateCastle() {
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
  const deriveKey = (sk) => {
    const kb = Buffer.from(sk, "base64");
    const c = Buffer.concat([kb, Buffer.from("T!BgJB")]);
    return c.length < 16 ? Buffer.concat([c, Buffer.alloc(16 - c.length)]) : c.subarray(0, 16);
  };
  const decrypt = (ct, sk) => {
    const k = deriveKey(sk);
    const d = createDecipheriv("aes-128-cbc", k, k);
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  };
  const safe = (t) => JSON.parse(t.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"'));
  const cipher = async (res) => {
    const t = (await res.text()).trim();
    try {
      const p = JSON.parse(t);
      if (typeof p.data === "string") return p.data.trim();
    } catch {
      /* raw */
    }
    return t;
  };
  const unwrap = (obj) => (obj?.data && typeof obj.data === "object" && !Array.isArray(obj.data) ? obj.data : obj);

  const sec = (
    await (
      await fetch(
        `${CASTLE_BASE}/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`,
        { headers },
      )
    ).json()
  ).data;
  const params = new URLSearchParams({
    channel: CHANNEL,
    clientType: CLIENT,
    keyword: "Inception 2010",
    lang: LANG,
    mode: "1",
    packageName: PKG,
    page: "1",
    size: "30",
  });
  const search = safe(
    decrypt(await cipher(await fetch(`${CASTLE_BASE}/film-api/v1.1.0/movie/searchByKeyword?${params}`, { headers })), sec),
  );
  const rows = unwrap(search).rows || [];
  const match = rows.find((r) => /inception/i.test(r.title || "")) || rows[0];
  if (!match) return { id: "castletv", ok: false, reason: "no rows" };
  const movieId = String(match.id);
  const detail = unwrap(
    safe(
      decrypt(
        await cipher(
          await fetch(
            `${CASTLE_BASE}/film-api/v1.9.9/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${movieId}&packageName=${PKG}`,
            { headers },
          ),
        ),
        sec,
      ),
    ),
  );
  const episodes = detail.episodes || [];
  const episodeId = episodes[0]?.id != null ? String(episodes[0].id) : null;
  const tracks = (episodes[0]?.tracks || []).filter((t) => t.existIndividualVideo === true);
  const track = tracks[0] || (episodes[0]?.tracks || [])[0];
  if (!episodeId) return { id: "castletv", ok: false, reason: "no episode", detailKeys: Object.keys(detail) };

  const bodies = [];
  if (track?.languageId != null) {
    bodies.push({
      mode: "1",
      appMarket: "GuanWang",
      clientType: CLIENT,
      woolUser: "false",
      apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
      androidVersion: "13",
      movieId,
      episodeId,
      languageId: String(track.languageId),
      isNewUser: "true",
      resolution: "3",
      packageName: PKG,
    });
  }
  bodies.push({
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
  });

  for (const body of bodies) {
    const v = unwrap(
      safe(
        decrypt(
          await cipher(
            await fetch(
              `${CASTLE_BASE}/film-api/v2.0.1/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`,
              {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            ),
          ),
          sec,
        ),
      ),
    );
    const url = v.videoUrl || v.videos?.[0]?.url;
    if (url) {
      const play = await headOk(url, {
        Referer: CASTLE_BASE,
        Accept: "video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5",
      });
      return {
        id: "castletv",
        ok: play.status === 200 || play.status === 206,
        title: match.title,
        movieId,
        episodeId,
        url: String(url).slice(0, 200),
        play,
        qualities: (v.videos || []).map((x) => x.resolutionDescription || x.resolution),
      };
    }
  }
  return {
    id: "castletv",
    ok: false,
    reason: "no videoUrl",
    title: match.title,
    episodeId,
    trackCount: (episodes[0]?.tracks || []).length,
  };
}

async function validateOneTouch() {
  const AES_KEY = Buffer.from("im72charPasswordofdInitVectorStm", "utf8");
  const AES_IV = Buffer.from("im72charPassword", "utf8");
  const decrypt = (encoded) => {
    let s = encoded.replace(/-_\./g, "/").replace(/@/g, "+").replace(/\s+/g, "");
    const pad = s.length % 4;
    if (pad !== 0) s += "=".repeat(4 - pad);
    const d = createDecipheriv("aes-256-cbc", AES_KEY, AES_IV);
    return JSON.parse(Buffer.concat([d.update(Buffer.from(s, "base64")), d.final()]).toString("utf8"));
  };
  const get = async (path) => {
    const r = await fetch(`https://api3.devcorp.me${path}`, {
      headers: { "User-Agent": UA, Referer: "https://onetouchtv.xyz/" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return decrypt(await r.text()).result;
  };

  const list = await get("/vod/search?keyword=Inception");
  const hit =
    list.find((x) => /inception/i.test(x.title) && String(x.year) === "2010" && x.type === "movie") ||
    list.find((x) => /^inception\b/i.test(x.title) && x.type === "movie" && x.status !== "upcoming");
  if (!hit) {
    return {
      id: "onetouchtv",
      ok: false,
      reason: "no 2010 match",
      samples: list.filter((x) => /incep/i.test(x.title)).map((x) => `${x.title} (${x.year})`),
    };
  }
  const detail = await get(`/vod/${hit.id}/detail`);
  const playId = detail.episodes?.[0]?.playId;
  const ep = await get(`/vod/${hit.id}/episode/${playId}`);
  const url = ep.sources?.[0]?.url;
  const play = url
    ? await headOk(url, { Referer: "https://api3.devcorp.me/" })
    : null;
  return {
    id: "onetouchtv",
    ok: Boolean(url) && (play?.status === 200 || play?.status === 206 || play?.isM3u8),
    hit: hit.title,
    year: hit.year,
    url,
    play,
    sourceCount: ep.sources?.length,
  };
}

const out = {
  at: new Date().toISOString(),
  castle: await validateCastle().catch((e) => ({ id: "castletv", ok: false, error: e.message })),
  onetouch: await validateOneTouch().catch((e) => ({ id: "onetouchtv", ok: false, error: e.message })),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(new URL("./source-hunt-r5-validate.json", import.meta.url), JSON.stringify(out, null, 2));
