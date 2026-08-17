/**
 * The hero/rows show romaji because MangaDex's primary title is often the
 * romanised original. Dump title + altTitles for the popular list so we can see
 * where the real English name actually lives.
 * Usage: node scripts/goon-manga-titles.mjs
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
      limit: 12,
      "includes[]": ["cover_art"],
      "contentRating[]": ["safe", "suggestive"],
      "availableTranslatedLanguage[]": ["en"],
      "order[followedCount]": "desc",
      hasAvailableChapters: "true",
    })}`,
  )
).json();

for (const m of list.data) {
  const a = m.attributes;
  const alt = (a.altTitles ?? [])
    .map((o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(""))
    .filter((s) => s.startsWith("en:") || s.startsWith("ja-ro"))
    .slice(0, 4);
  console.log("title:", JSON.stringify(a.title));
  console.log("  origLang:", a.originalLanguage);
  console.log("  alt(en/ja-ro):", alt.join(" | "));
  console.log("");
}
