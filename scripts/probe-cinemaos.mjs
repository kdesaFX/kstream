#!/usr/bin/env node
const PROXY = "https://kdesa.stream/api/proxy?destination=";
const API = Buffer.from(
  "aHR0cHM6Ly9jaW5lbWFvcy12My52ZXJjZWwuYXBwL2FwaS9uZW8vYmFja2VuZGZldGNo",
  "base64",
).toString();
console.log("API", API);

const servers = [
  "shadow",
  "asiacloud",
  "ophim",
  "flowcast",
  "hq",
  "ninja",
  "alpha",
  "volt",
  "ee3",
  "ghost",
  "halo",
  "cast",
  "zenith",
  "kaze",
];

async function probe(url) {
  const r = await fetch(PROXY + encodeURIComponent(url), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  const t = await r.text();
  return { status: r.status, len: t.length, text: t };
}

(async () => {
  for (const s of servers) {
    const url = `${API}?requestID=movieVideoProvider&id=27205&service=${s}`;
    try {
      const r = await probe(url);
      const hit = /m3u8|\.mp4|"url"|sources/i.test(r.text);
      console.log(
        s.padEnd(12),
        r.status,
        String(r.len).padStart(6),
        hit ? "HIT" : "   ",
        r.text.slice(0, 160).replace(/\s+/g, " "),
      );
    } catch (e) {
      console.log(s.padEnd(12), "ERR", e.message);
    }
  }

  const tv = await probe(
    `${API}?requestID=tvVideoProvider&id=1396&service=shadow&season=1&episode=1`,
  );
  console.log("\ntv-shadow", tv.status, tv.text.slice(0, 400));

  // Hexa embeds use different path?
  const hexa = await probe(`${API}?requestID=movieVideoProvider&id=27205&service=hexa`);
  console.log("\nhexa", hexa.status, hexa.text.slice(0, 400));
})();
