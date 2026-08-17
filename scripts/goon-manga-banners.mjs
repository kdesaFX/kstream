/**
 * The manga hero needs a wide backdrop, which MangaDex does not have. Check how
 * many of the titles MangaDex would feature have a banner on AniList, and
 * whether one batched GraphQL request can fetch them all.
 * Usage: node scripts/goon-manga-banners.mjs
 */
const MD = "https://api.mangadex.org";

function mdQuery(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) sp.append(key, String(v));
    else sp.append(key, String(value));
  }
  return sp.toString();
}

const list = await (
  await fetch(
    `${MD}/manga?${mdQuery({
      limit: 24,
      "includes[]": ["cover_art"],
      "contentRating[]": ["safe", "suggestive"],
      "availableTranslatedLanguage[]": ["en"],
      "order[followedCount]": "desc",
      hasAvailableChapters: "true",
    })}`,
  )
).json();

const titles = list.data.map((m) => {
  const t = m.attributes.title;
  return {
    id: m.id,
    title: t.en ?? t["ja-ro"] ?? Object.values(t)[0],
    hasDescription: Boolean((m.attributes.description?.en ?? "").trim()),
  };
});

console.log(`MangaDex popular: ${titles.length} titles\n`);

// One request, one alias per title — 24 searches in a single round trip.
// Page(...) instead of Media(...): a miss returns an empty list rather than a
// 404 that voids the whole batch.
const parts = titles.map(
  (_, i) => `
  m${i}: Page(perPage: 1) {
    media(search: $s${i}, type: MANGA) {
      id
      bannerImage
      averageScore
      title { romaji english }
    }
  }`,
);
const vars = titles.map((_, i) => `$s${i}: String`).join(", ");
const query = `query (${vars}) {${parts.join("")}\n}`;
const variables = Object.fromEntries(titles.map((t, i) => [`s${i}`, t.title]));

const res = await fetch("https://graphql.anilist.co", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ query, variables }),
});
const json = await res.json();
console.log(`AniList batch: ${res.status}`);
if (json.errors) console.log(`errors: ${JSON.stringify(json.errors).slice(0, 400)}`);

let withBanner = 0;
titles.forEach((t, i) => {
  const hit = json.data?.[`m${i}`]?.media?.[0];
  const banner = hit?.bannerImage;
  if (banner) withBanner += 1;
  console.log(
    `${(t.title ?? "").slice(0, 34).padEnd(36)} desc=${t.hasDescription ? "y" : "n"}  ` +
      `anilist=${hit ? hit.id : "none"}  score=${hit?.averageScore ?? "-"}  banner=${banner ? "YES" : "no"}`,
  );
});

console.log(`\nbanners: ${withBanner}/${titles.length}`);
