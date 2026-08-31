#!/usr/bin/env node
const PROXY = "https://kdesa.stream/api/proxy?destination=";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

async function probe(name, url, headers = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(PROXY + encodeURIComponent(url), {
      headers: { Accept: "*/*", "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(18000),
    });
    const t = await r.text();
    let score = 0;
    if (t.includes("#extm3u")) score += 50;
    if (/m3u8/i.test(t)) score += 30;
    if (/"sources"/.test(t)) score += 20;
    if (/"url"/.test(t) && /"file"/.test(t)) score += 15;
    if (/1080|2160/.test(t)) score += 10;
    if (/1016|session_required|too_many|just a moment/i.test(t)) score -= 40;
    console.log(
      `${name.padEnd(26)} ${String(r.status).padStart(3)} ${String(Date.now() - t0).padStart(5)}ms score=${String(score).padStart(3)} ${t.slice(0, 90).replace(/\s+/g, " ")}`,
    );
    return { name, status: r.status, score, ms: Date.now() - t0 };
  } catch (e) {
    console.log(`${name.padEnd(26)} ERR ${e.message.slice(0, 60)}`);
    return { name, error: e.message };
  }
}

const m = 27205;
const tv = [1396, 1, 1];

const encVid = await fetch(
  PROXY + encodeURIComponent(`https://enc-dec.app/api/enc-videasy?text=${m}`),
).then((r) => r.json()).catch(() => null);

const list = [
  ["reyna-chal", "https://api.reallyfast.xyz/api/challenge", { Referer: "https://goated.cx/", Origin: "https://goated.cx" }],
  ["insertunit", `https://isut.streamflix.one/api/source/${m}`, {}],
  ["vidjoy", `https://vidjoy.pro/embed/api/fastfetch/${m}?sr=0`, {}],
  ["animecurx", `https://embed.animecurx.tech/api/source/movie/${m}`, {}],
  ["hydrahd", `https://hydrahd.com/api/sources/movie/${m}`, {}],
  ["movielair", `https://movielair.cc/api/b/movie/${m}`, {}],
  ["111movies", `https://111movies.com/api/source/${m}`, {}],
  ["vidsrc-embed", `https://vidsrc-embed.ru/api/source/${m}`, {}],
  ["embedflix", `https://embedflix.online/api/movie/${m}`, {}],
  ["rgshows", `https://api.rgshows.me/v1/movie/${m}`, {}],
  ["cinemaos-live", `https://cinemaos.live/api/source/movie/${m}`, {}],
  ["vidrift", `https://vidrift.net/api/movie/${m}`, {}],
  ["smashy2", `https://llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch.co.uk/api/movie/${m}`, {}],
  ["pressplay", `https://pressplay.top/api/source/movie/${m}`, {}],
  ["dahmer", `https://dahmer.dad/player/movie/${m}`, {}],
];
if (encVid?.result) {
  list.push([
    "videasy",
    `https://player.videasy.net/api/movie/${encVid.result}`,
    { Referer: "https://player.videasy.net/" },
  ]);
}

for (const [n, u, h] of list) await probe(n, u, h);
