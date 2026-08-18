/** MangaDex tag UUIDs (genre group) for discover carousels. */
export const MANGA_GENRE_TAGS = {
  action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  fantasy: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  crime: "5ca48985-9a9d-4bd8-be29-80dc0303db72",
  drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  mystery: "ee968100-4191-4968-93d3-f82d72be7e46",
  sciFi: "256c8bd9-4904-4360-bf4f-508a76d67183",
  sliceOfLife: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  sports: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  thriller: "07251805-a27e-4d59-b488-f0bfbec15168",
} as const;

export type MangaGenreTagKey = keyof typeof MANGA_GENRE_TAGS;

export const MANGA_DISCOVER_GENRES = [
  { id: MANGA_GENRE_TAGS.action, name: "Action" },
  { id: MANGA_GENRE_TAGS.adventure, name: "Adventure" },
  { id: MANGA_GENRE_TAGS.comedy, name: "Comedy" },
  { id: MANGA_GENRE_TAGS.drama, name: "Drama" },
  { id: MANGA_GENRE_TAGS.fantasy, name: "Fantasy" },
  { id: MANGA_GENRE_TAGS.romance, name: "Romance" },
  { id: MANGA_GENRE_TAGS.crime, name: "Crime" },
  { id: MANGA_GENRE_TAGS.horror, name: "Horror" },
  { id: MANGA_GENRE_TAGS.mystery, name: "Mystery" },
  { id: MANGA_GENRE_TAGS.sciFi, name: "Sci-Fi" },
  { id: MANGA_GENRE_TAGS.sliceOfLife, name: "Slice of Life" },
  { id: MANGA_GENRE_TAGS.sports, name: "Sports" },
  { id: MANGA_GENRE_TAGS.thriller, name: "Thriller" },
] as const;

const GENRE_NAMES: Set<string> = new Set(
  MANGA_DISCOVER_GENRES.map((genre) => genre.name),
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
