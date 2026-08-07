import { Icons } from "@/components/Icon";

/** Map TMDB genre names to the outline icons used on genre pills. */
export function getGenreIcon(name?: string | null): Icons {
  const n = (name ?? "").toLowerCase();
  if (n.includes("action")) return Icons.GENRE_ACTION;
  if (n.includes("adventure")) return Icons.GENRE_ADVENTURE;
  if (n.includes("animation")) return Icons.GENRE_ANIMATION;
  if (n.includes("comedy")) return Icons.GENRE_COMEDY;
  if (n.includes("crime")) return Icons.GENRE_CRIME;
  if (n.includes("documentary")) return Icons.GENRE_DOCUMENTARY;
  if (n.includes("drama")) return Icons.GENRE_DRAMA;
  if (n.includes("family")) return Icons.GENRE_FAMILY;
  if (n.includes("fantasy")) return Icons.GENRE_FANTASY;
  if (n.includes("history")) return Icons.GENRE_HISTORY;
  if (n.includes("horror")) return Icons.GENRE_HORROR;
  if (n.includes("music")) return Icons.GENRE_MUSIC;
  if (n.includes("mystery")) return Icons.GENRE_MYSTERY;
  if (n.includes("romance")) return Icons.GENRE_ROMANCE;
  if (n.includes("sci-fi") || n.includes("science")) return Icons.GENRE_SCIFI;
  if (n.includes("tv movie") || n.includes("tv-movie")) return Icons.FILM;
  if (n.includes("thriller")) return Icons.GENRE_THRILLER;
  if (n.includes("war")) return Icons.GENRE_WAR;
  if (n.includes("western")) return Icons.GENRE_WESTERN;
  return Icons.FILM;
}
