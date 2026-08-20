const ANILIST = "https://graphql.anilist.co";
const title = process.argv[2] || "Chainsaw Man";
const body = JSON.stringify({
  query: `query ($s: String) {
    Page(perPage: 1) {
      media(search: $s, type: MANGA, sort: SEARCH_MATCH) {
        title { english romaji }
        relations {
          edges {
            relationType
            node { type title { english romaji } }
          }
        }
      }
    }
  }`,
  variables: { s: title },
});
const r = await fetch(ANILIST, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const j = await r.json();
const media = j.data?.Page?.media?.[0];
const edges = media?.relations?.edges ?? [];
const anime = edges
  .filter(
    (e) =>
      (e.relationType === "ADAPTATION" || e.relationType === "SOURCE") &&
      e.node?.type === "ANIME",
  )
  .map((e) => ({
    relation: e.relationType,
    title: e.node.title.english || e.node.title.romaji,
  }));
console.log(JSON.stringify({ manga: media?.title, anime }, null, 2));
