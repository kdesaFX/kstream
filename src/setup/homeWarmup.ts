import {
  type FeaturedHeroCategory,
  type FeaturedMedia,
  fetchFeaturedHeroMedia,
  preloadFeaturedBackdrop,
} from "@/pages/discover/lib/featuredHero";
import { hasFeaturedAlgorithmSignal } from "@/pages/discover/hooks/usePersonalRecommendations";
import { useDiscoverStore } from "@/stores/discover";
import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { getTmdbLanguageCode } from "@/utils/locale/language";

export const BOOT_WARMUP_MIN_MS = 400;
export const BOOT_WARMUP_MAX_MS = 1500;

export interface HomeWarmupCache {
  category: FeaturedHeroCategory;
  language: string;
  media: FeaturedMedia[];
  fetchedAt: number;
  /** True when slides were built with algorithm / high-% watch signal. */
  personalized: boolean;
}

export interface ConsumedHomeWarmup {
  media: FeaturedMedia[];
  personalized: boolean;
}

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
};

let homeWarmupCache: HomeWarmupCache | null = null;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Resolve when `promise` settles or `ms` elapses — never rejects from timeout. */
export async function settleWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms).then(() => undefined)]);
}

/** Wait for a zustand persist store (or timeout) so taste isn't empty on boot. */
export function waitForPersistHydration(
  persist: PersistApi,
  ms = 600,
): Promise<void> {
  if (persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const unsub = persist.onFinishHydration(finish);
    window.setTimeout(() => {
      unsub();
      finish();
    }, ms);
  });
}

export function peekHomeWarmup(
  category: FeaturedHeroCategory,
  language: string,
): FeaturedMedia[] | null {
  if (!homeWarmupCache) return null;
  if (
    homeWarmupCache.category !== category ||
    homeWarmupCache.language !== language
  ) {
    return null;
  }
  return homeWarmupCache.media;
}

/** Read and clear a matching warmup cache entry (includes personalization flag). */
export function consumeHomeWarmup(
  category: FeaturedHeroCategory,
  language: string,
): ConsumedHomeWarmup | null {
  if (!homeWarmupCache) return null;
  if (
    homeWarmupCache.category !== category ||
    homeWarmupCache.language !== language
  ) {
    return null;
  }
  const consumed: ConsumedHomeWarmup = {
    media: homeWarmupCache.media,
    personalized: homeWarmupCache.personalized,
  };
  homeWarmupCache = null;
  return consumed;
}

/** Test helper — inject or clear the module cache. */
export function setHomeWarmupCacheForTests(cache: HomeWarmupCache | null) {
  homeWarmupCache = cache;
}

export function getHomeWarmupCacheForTests(): HomeWarmupCache | null {
  return homeWarmupCache;
}

/**
 * Prefetch featured hero + first backdrop for the current discover category.
 * Failures are swallowed so boot never hangs on warmup.
 */
export async function warmupHomeHero(): Promise<HomeWarmupCache | null> {
  try {
    const enableFeatured = usePreferencesStore.getState().enableFeatured;
    if (!enableFeatured) return null;

    const category = useDiscoverStore.getState()
      .selectedCategory as FeaturedHeroCategory;
    const userLanguage = useLanguageStore.getState().language;
    const language = getTmdbLanguageCode(userLanguage);

    // Local loves/progress often live in persist — wait briefly so we don't
    // bake a generic Planet-of-the-Apes hero that later flickers to anime.
    await Promise.all([
      waitForPersistHydration(useRatingsStore.persist),
      waitForPersistHydration(useProgressStore.persist),
      waitForPersistHydration(useWatchHistoryStore.persist),
    ]);

    const isTVShow = category === "tvshows";
    const personalized =
      category !== "manga" && hasFeaturedAlgorithmSignal(isTVShow);

    const media = await fetchFeaturedHeroMedia({
      category,
      language,
      includePersonalization: personalized,
    });

    homeWarmupCache = {
      category,
      language,
      media,
      fetchedAt: Date.now(),
      personalized,
    };

    if (media[0]) {
      await preloadFeaturedBackdrop(media[0]);
    }

    return homeWarmupCache;
  } catch (err) {
    console.error("Home hero warmup failed:", err);
    return null;
  }
}

export interface RunBootWarmupOptions {
  /** Auth restore / session restore work. Must not throw for timeout path. */
  authWork: () => Promise<void>;
  heroWork?: () => Promise<unknown>;
  minMs?: number;
  maxMs?: number;
}

/**
 * Hold the boot splash until auth + hero warmup settle, with min/max bounds.
 */
export async function runBootWarmup(
  options: RunBootWarmupOptions,
): Promise<void> {
  const minMs = options.minMs ?? BOOT_WARMUP_MIN_MS;
  const maxMs = options.maxMs ?? BOOT_WARMUP_MAX_MS;
  const heroWork = options.heroWork ?? warmupHomeHero;
  const started = Date.now();

  const work = Promise.allSettled([
    options.authWork().catch((err) => {
      console.error("Boot auth restore failed:", err);
    }),
    heroWork().catch((err) => {
      console.error("Boot hero warmup failed:", err);
    }),
    // Wake scrape proxies during splash so the first play after reopen
    // is less likely to miss on a cold edge (esp. mobile).
    import("@/backend/providers/providers")
      .then(({ ensureSameOriginProxiesWarm }) =>
        ensureSameOriginProxiesWarm(1200),
      )
      .catch(() => undefined),
    // Manga discover uses AniList + MangaDex id resolve — warm while splash
    // is up so the manga tab isn't cold vs movies/TV.
    Promise.resolve()
      .then(() => {
        if (!usePreferencesStore.getState().enableMangaDiscover) return;
        return import("@/backend/manga/discoverCatalog").then(
          ({ prefetchDiscoverManga }) => prefetchDiscoverManga(),
        );
      })
      .catch(() => undefined),
  ]);

  await settleWithTimeout(work, maxMs);

  const elapsed = Date.now() - started;
  if (elapsed < minMs) {
    await sleep(minMs - elapsed);
  }
}
