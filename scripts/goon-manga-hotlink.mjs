/**
 * An <img> with no referrer fails against the MangaDex image nodes while a
 * fetch() with the same policy succeeds, so something other than Referer is
 * being checked. Walk the header combinations an image request would send.
 * Usage: node scripts/goon-manga-hotlink.mjs
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const feed = await (
  await fetch(
    "https://api.mangadex.org/manga/d7037b2a-874a-4360-8a7b-07f2899152fd/feed?limit=1&translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc",
  )
).json();
const atHome = await (
  await fetch(
    `https://api.mangadex.org/at-home/server/${feed.data[0].id}?forcePort443=true`,
  )
).json();
const page = `${atHome.baseUrl}/data/${atHome.chapter.hash}/${atHome.chapter.data[0]}`;
console.log(`page ${page}\n`);

const imageHeaders = {
  "User-Agent": UA,
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "Accept-Language": "en-US,en;q=0.9",
};

const cases = [
  ["bare", {}],
  ["image headers, no referer", imageHeaders],
  [
    "image headers + referer",
    { ...imageHeaders, Referer: "https://kdesa.stream/" },
  ],
  [
    "image headers + origin",
    { ...imageHeaders, Origin: "https://kdesa.stream" },
  ],
];

for (const [label, headers] of cases) {
  // eslint-disable-next-line no-await-in-loop
  const res = await fetch(page, { headers });
  // eslint-disable-next-line no-await-in-loop
  const buf = await res.arrayBuffer();
  console.log(
    `${label.padEnd(28)} status=${res.status} type=${res.headers.get("content-type")} bytes=${buf.byteLength}`,
  );
}
