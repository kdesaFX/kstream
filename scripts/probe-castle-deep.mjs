import { createDecipheriv } from "crypto";

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

function deriveKey(sk) {
  const kb = Buffer.from(sk, "base64");
  const c = Buffer.concat([kb, Buffer.from("T!BgJB")]);
  return c.length < 16 ? Buffer.concat([c, Buffer.alloc(16 - c.length)]) : c.subarray(0, 16);
}
function decrypt(ct, sk) {
  const k = deriveKey(sk);
  const d = createDecipheriv("aes-128-cbc", k, k);
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
function safe(t) {
  return JSON.parse(t.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"'));
}
async function cipher(res) {
  const t = (await res.text()).trim();
  try {
    const p = JSON.parse(t);
    if (typeof p.data === "string") return p.data.trim();
  } catch {
    /* raw */
  }
  return t;
}
const unwrap = (o) => (o?.data && typeof o.data === "object" && !Array.isArray(o.data) ? o.data : o);

async function deep(keyword) {
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
    keyword,
    lang: LANG,
    mode: "1",
    packageName: PKG,
    page: "1",
    size: "30",
  });
  const search = unwrap(
    safe(decrypt(await cipher(await fetch(`${CASTLE_BASE}/film-api/v1.1.0/movie/searchByKeyword?${params}`, { headers })), sec)),
  );
  const match = (search.rows || [])[0];
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
  console.log("\n==", keyword, "=>", match.title);
  console.log("unlockPlayback", match.unlockPlayback, "resolution", match.resolution, "india", match.indiaResolutionLabel);
  console.log("episodes", (detail.episodes || []).length, "seasons", (detail.seasons || []).length);
  const ep = detail.episodes?.[0];
  console.log(
    "ep0",
    JSON.stringify({
      id: ep?.id,
      number: ep?.number,
      tracks: (ep?.tracks || []).map((t) => ({
        languageId: t.languageId,
        languageName: t.languageName,
        existIndividualVideo: t.existIndividualVideo,
      })),
    }).slice(0, 600),
  );

  const episodeId = String(ep.id);
  const tries = [];
  for (const track of ep.tracks || [{}, null]) {
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
      };
      if (track?.languageId != null) body.languageId = String(track.languageId);
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
      tries.push({
        lang: track?.languageName || "shared",
        resolution,
        denied: Boolean(v.permissionDenied),
        url: Boolean(url),
        quals: (v.videos || []).map((x) => x.resolutionDescription),
      });
      if (url) break;
    }
    if (tries.some((t) => t.url)) break;
  }
  console.log("tries", JSON.stringify(tries));
}

await deep("Dune Part Two 2024");
await deep("The Dark Knight 2008");
await deep("Interstellar 2014");
