#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const PROXY = "https://kdesa.stream/api/proxy?destination=";

async function get(url, headers = {}) {
  const r = await fetch(PROXY + encodeURIComponent(url), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ...headers,
    },
  });
  const text = await r.text();
  return { status: r.status, text };
}

async function main() {
  const out = {};

  // Vidrock same-URL check (known stub)
  const a = await get("https://vidrock.net/api/movie/27205");
  const b = await get("https://vidrock.net/api/movie/693134");
  const c = await get("https://vidrock.net/api/tv/1396/1/1");
  const ua = JSON.parse(a.text);
  const ub = JSON.parse(b.text);
  const uc = JSON.parse(c.text);
  out.vidrock = {
    inception: ua.source1?.url,
    dune: ub.source1?.url,
    breakingBad: uc.source1?.url,
    sameStub: ua.source1?.url === ub.source1?.url && ub.source1?.url === uc.source1?.url,
  };

  // PrimeSrc movie + resolve 1080 link
  const ps = await get("https://primesrc.me/api/v1/s?tmdb=27205&type=movie");
  const pj = JSON.parse(ps.text);
  const servers = (pj.servers || []).slice(0, 8).map((s) => ({
    name: s.name,
    file: s.file_name,
    key: s.key,
  }));
  out.primesrcServers = servers;

  const prefer =
    pj.servers?.find((s) => /1080/i.test(s.file_name || "")) ||
    pj.servers?.find((s) => s.name === "Filemoon") ||
    pj.servers?.[0];
  if (prefer?.key) {
    const link = await get(`https://primesrc.me/api/v1/l?key=${prefer.key}`);
    out.primesrcLink = { status: link.status, body: link.text.slice(0, 500), server: prefer };
  }

  // TV
  const pst = await get(
    "https://primesrc.me/api/v1/s?tmdb=1396&season=1&episode=1&type=tv",
  );
  const ptj = JSON.parse(pst.text);
  out.primesrcTvCount = ptj.servers?.length ?? 0;
  out.primesrcTvSample = (ptj.servers || []).slice(0, 5).map((s) => ({
    name: s.name,
    file: s.file_name,
  }));

  // More hosts with quality in filename
  const more = [
    ["hexa", "https://hexared.com/"],
    ["vidzee", "https://vidzee.wtf/api/movie/27205"],
    ["flicky", "https://flicky.host/api/stream?tmdb=27205&type=movie"],
    ["cinemaos", "https://cinemaos.online/api/sources/27205"],
  ];
  out.extras = {};
  for (const [id, url] of more) {
    const r = await get(url);
    out.extras[id] = { status: r.status, preview: r.text.slice(0, 250) };
  }

  console.log(JSON.stringify(out, null, 2));
  writeFileSync("scripts/source-hunt-godly-deep.json", JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
