import type { DiscoverMedia } from "@/pages/discover/types/discover";
import type { MediaItem } from "@/utils/media/mediaTypes";

export function formatVoteAverage(
  value: number | undefined | null,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function getDiscoverPosterUrl(posterPath: string): string {
  if (!posterPath) return "/placeholder.png";
  if (posterPath.startsWith("http")) return posterPath;
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

export function discoverMediaToMediaItem(
  item: DiscoverMedia,
  isTVShow: boolean,
): MediaItem {
  return {
    id: item.id.toString(),
    title: item.title || item.name || "",
    poster: getDiscoverPosterUrl(item.poster_path),
    type: isTVShow ? "show" : "movie",
    year: isTVShow
      ? item.first_air_date
        ? parseInt(item.first_air_date.split("-")[0]!, 10)
        : undefined
      : item.release_date
        ? parseInt(item.release_date.split("-")[0]!, 10)
        : undefined,
    adult: item.adult === true,
    voteAverage: formatVoteAverage(item.vote_average),
  };
}
