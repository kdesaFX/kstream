import { fetchAnilistMangaRecommendationTitles } from "@/backend/manga/anilistRecommendations";
import { pickGenreTagIds } from "@/backend/manga/mangaTags";
import {
  getMangaDetails,
  listManga,
  mangaToMediaItem,
  searchManga,
} from "@/backend/manga/mangadex";
import type { MangaTag } from "@/backend/manga/types";
import type { MediaItem } from "@/utils/media/mediaTypes";

function dedupeItems(items: MediaItem[], excludeId: string): MediaItem[] {
  const seen = new Set<string>([excludeId]);
  const out: MediaItem[] = [];
  for (const item of items) {
    const id = String(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

async function tagBasedCandidates(
  tagIds: string[],
  excludeId: string,
  perTag = 12,
): Promise<MediaItem[]> {
  if (tagIds.length === 0) return [];
  const batches = await Promise.all(
    tagIds.map((tagId) =>
      listManga({
        order: "followedCount",
        limit: perTag,
        includeStats: false,
        includedTags: [tagId],
      }),
    ),
  );
  return dedupeItems(
    batches.flatMap((batch) => batch.map(mangaToMediaItem)),
    excludeId,
  );
}

async function anilistCandidates(
  seedTitle: string,
  excludeId: string,
  limit = 20,
): Promise<MediaItem[]> {
  const titles = await fetchAnilistMangaRecommendationTitles(seedTitle, limit);
  if (titles.length === 0) return [];

  const settled = await Promise.allSettled(
    titles.slice(0, 12).map((title) => searchManga(title, 1)),
  );
  const items: MediaItem[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const hit = result.value[0];
    if (hit) items.push(mangaToMediaItem(hit));
  }
  return dedupeItems(items, excludeId);
}

/** Related manga for a seed title — tag overlap plus AniList recs. */
export async function fetchMangaRecommendations(opts: {
  seedId: string;
  seedTitle: string;
  seedTags?: MangaTag[];
  limit?: number;
}): Promise<MediaItem[]> {
  const limit = opts.limit ?? 24;
  let tags = opts.seedTags ?? [];
  if (tags.length === 0) {
    try {
      const details = await getMangaDetails(opts.seedId);
      tags = details.tags;
    } catch {
      tags = [];
    }
  }

  const tagIds = pickGenreTagIds(tags);
  const [byTags, byAnilist] = await Promise.all([
    tagBasedCandidates(tagIds, opts.seedId),
    anilistCandidates(opts.seedTitle, opts.seedId),
  ]);

  return dedupeItems([...byAnilist, ...byTags], opts.seedId).slice(0, limit);
}
