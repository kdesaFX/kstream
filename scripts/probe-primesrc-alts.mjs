#!/usr/bin/env node
/** Dump full primesrc server list + try alternate link endpoints */
const PROXY = "https://kdesa.stream/api/proxy?destination=";

async function get(url) {
  const r = await fetch(PROXY + encodeURIComponent(url), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://primesrc.me/",
      Origin: "https://primesrc.me",
      Accept: "application/json",
    },
  });
  return { status: r.status, text: await r.text() };
}

(async () => {
  const list = await get("https://primesrc.me/api/v1/s?tmdb=27205&type=movie");
  const data = JSON.parse(list.text);
  const names = {};
  for (const s of data.servers || []) {
    names[s.name] = (names[s.name] || 0) + 1;
  }
  console.log("host counts", names);
  console.log("total", data.servers?.length);

  const key = data.servers.find((s) => /1080/i.test(s.file_name || ""))?.key;
  console.log("try key", key);

  const alts = [
    `https://primesrc.me/api/v1/l?key=${key}`,
    `https://primesrc.me/api/v1/link?key=${key}`,
    `https://primesrc.me/api/v1/get?key=${key}`,
    `https://primesrc.me/api/v1/l/${key}`,
    `https://api.primesrc.me/v1/l?key=${key}`,
  ];
  for (const u of alts) {
    const r = await get(u);
    console.log(r.status, u.slice(0, 60), r.text.slice(0, 120).replace(/\s+/g, " "));
  }

  // Does list ever include direct url?
  const withUrl = (data.servers || []).filter((s) => s.url || s.link || s.embed);
  console.log("servers with url/link/embed", withUrl.length, withUrl[0]);
})();
