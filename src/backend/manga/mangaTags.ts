/** MangaDex tag UUIDs (genre group) for discover carousels. */
export const MANGA_GENRE_TAGS = {
  action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  fantasy: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  sliceOfLife: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
} as const;

export type MangaGenreTagKey = keyof typeof MANGA_GENRE_TAGS;

const GENRE_NAMES = new Set(
  Object.keys(MANGA_GENRE_TAGS).map((k) => {
    if (k === "sliceOfLife") return "Slice of Life";
    return k.charAt(0).toUpperCase() + k.slice(1);
  }),
);

/** Prefer genre tags from a title when building recommendation queries. */
export function pickGenreTagIds(
  tags: Array<{ id: string; name: string }>,
  max = 2,
): string[] {
  const genre = tags.filter((t) => GENRE_NAMES.has(t.name)).map((t) => t.id);
  if (genre.length >= max) return genre.slice(0, max);
  const rest = tags
    .map((t) => t.id)
    .filter((id) => !genre.includes(id));
  return [...genre, ...rest].slice(0, max);
}
