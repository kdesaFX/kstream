import classNames from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getAllTimeBestMovies,
  getAllTimeBestShows,
  getMediaPoster,
} from "@/backend/metadata/tmdb";
import { Button } from "@/components/buttons/Button";
import { usePersonalRecommendations } from "@/pages/discover/hooks/usePersonalRecommendations";
import {
  FRANCHISES,
  GENRE_LABELS,
  MOODS,
  inferPrefsFromCompletedWatches,
  type HistorySource,
  type RatingSource,
} from "@/pages/discover/lib/personalRecommendations";
import {
  hydrateHistoryItemGenres,
  hydrateMissingCompletedGenres,
} from "@/pages/discover/lib/watchHistoryGenres";
import { MediaRating, useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";

const RATE_CHOICES: Array<{ label: string; rating: MediaRating | null }> = [
  { label: "Loved it!", rating: "loved" },
  { label: "Liked it", rating: "liked" },
  { label: "Meh, it was okay", rating: "okay" },
  { label: "Didn't like it", rating: "disliked" },
  { label: "I haven't watched it", rating: null },
];

// Genres offered in the picker (movie-canonical ids with broad appeal;
// buildTasteProfile translates these into TV-space where needed).
const PICKABLE_GENRES = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53,
  10752, 37,
];

// Minimal shape the rating step actually needs, so trending/all-time/
// personalized sources (which don't all carry the same TMDB fields) can be
// merged into one queue without lossy field-by-field mapping.
interface QuizItem {
  id: number;
  title: string;
  poster_path: string;
  /** Full poster URL when history already stored one. */
  posterUrl?: string;
  release_date?: string;
  genre_ids?: number[];
}

// Batch composition: prefer unrated completed watches first, then
// personalized + random popular. Later batches stay half personalized.
const BATCH_SIZE = 10;
const BATCH_PERSONALIZED_SHARE = 5;
const BATCH_HISTORY_SHARE = 6;
// Start fetching the next batch once the queue is this close to running out,
// so rating never has to pause waiting on a network request.
const REFILL_THRESHOLD = 5;
// Every N titles, nudge the user that it's fine to stop here rather than
// hard-capping the quiz.
const STOP_REMINDER_INTERVAL = 25;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

type WizardStep =
  | "movies"
  | "shows"
  | "genres"
  | "moods"
  | "franchises"
  | "done";

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ id: string; label: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onToggle(opt.id)}
          className={classNames(
            "rounded-full px-4 py-2 text-sm transition-colors",
            selected.has(opt.id)
              ? "bg-video-context-type-accent/30 text-white ring-1 ring-white/40"
              : "bg-white/5 text-white/80 hover:bg-white/10",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface RatingQueueResult {
  currentItem: QuizItem | undefined;
  ratedCount: number;
  loadError: boolean;
  refillFailed: boolean;
  showStopReminder: boolean;
  dismissStopReminder: () => void;
  rate: (rating: MediaRating | null) => void;
}

/**
 * Drives the "have you seen these?" queue for one medium (movies or shows):
 * prefers unrated completed watches, then trending+personalized mix.
 * `active` gates all fetching so the step that isn't currently shown doesn't
 * do background work.
 */
function useRatingQueue(
  mediaType: "movie" | "show",
  active: boolean,
): RatingQueueResult {
  const toggleRating = useRatingsStore((s) => s.toggleRating);
  const getRating = useRatingsStore((s) => s.getRating);

  const [items, setItems] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refillFailed, setRefillFailed] = useState(false);
  const [showStopReminder, setShowStopReminder] = useState(false);

  const seenIdsRef = useRef<Set<number>>(new Set());
  const batchCountRef = useRef(0);
  const refillingRef = useRef(false);

  const isTVShow = mediaType === "show";

  // Always on (not gated to retakes) so batches after the first can adapt
  // to ratings given earlier in *this* run — usePersonalRecommendations
  // reacts live to useRatingsStore, so as soon as a couple of things get
  // liked/loved the personalized share of the next batch reflects that.
  const { media: personalizedMedia } = usePersonalRecommendations({
    isTVShow,
    enabled: active,
  });

  const dedupe = (candidates: { id: number }[]): { id: number }[] =>
    candidates.filter((m) => {
      if (getRating(String(m.id))) return false;
      if (seenIdsRef.current.has(m.id)) return false;
      seenIdsRef.current.add(m.id);
      return true;
    });

  const toQuizItem = (r: {
    id: number;
    title?: string;
    name?: string;
    poster_path: string;
    release_date?: string;
    first_air_date?: string;
    genre_ids?: number[];
  }): QuizItem => ({
    id: r.id,
    title: (isTVShow ? r.name : r.title) ?? "",
    poster_path: r.poster_path,
    release_date: isTVShow ? r.first_air_date : r.release_date,
    genre_ids: r.genre_ids,
  });

  const fetchUnratedCompletedWatches = async (
    count: number,
  ): Promise<QuizItem[]> => {
    await hydrateMissingCompletedGenres(count + 5);
    const freshItems = useWatchHistoryStore.getState().items;

    const byTmdb = new Map<
      number,
      {
        title: string;
        year?: number;
        poster?: string;
        genreIds?: number[];
        watchedAt: number;
        historyKey: string;
      }
    >();

    for (const [key, item] of Object.entries(freshItems)) {
      if (!item.completed || item.type !== mediaType) continue;
      const tmdbId = Number(key.includes("-") ? key.split("-")[0]! : key);
      if (!Number.isFinite(tmdbId) || getRating(String(tmdbId))) continue;
      const existing = byTmdb.get(tmdbId);
      if (!existing || item.watchedAt > existing.watchedAt) {
        byTmdb.set(tmdbId, {
          title: item.title,
          year: item.year,
          poster: item.poster,
          genreIds: item.genreIds,
          watchedAt: item.watchedAt,
          historyKey: key,
        });
      }
    }

    const sorted = Array.from(byTmdb.entries()).sort(
      (a, b) => b[1].watchedAt - a[1].watchedAt,
    );

    const picks: QuizItem[] = [];
    for (const [id, item] of sorted) {
      if (picks.length >= count) break;
      if (seenIdsRef.current.has(id) || getRating(String(id))) continue;

      let genreIds = item.genreIds;
      if (!genreIds || genreIds.length === 0) {
        genreIds = await hydrateHistoryItemGenres(
          item.historyKey,
          String(id),
          mediaType,
        );
      }

      seenIdsRef.current.add(id);
      const posterIsUrl = Boolean(item.poster?.startsWith("http"));
      picks.push({
        id,
        title: item.title,
        poster_path: posterIsUrl ? "" : (item.poster ?? ""),
        posterUrl: posterIsUrl ? item.poster : undefined,
        release_date: item.year ? `${item.year}-01-01` : undefined,
        genre_ids: genreIds,
      });
    }

    return picks;
  };

  // A fresh random page every call (getAllTimeBestMovies/Shows pick a
  // random page from the well-known pool when no page is given), so
  // consecutive batches don't just crawl the same popularity ranking in
  // order and end up feeling like the same movies reshuffled.
  const fetchRandomPopular = async (count: number): Promise<QuizItem[]> => {
    const fetched = isTVShow
      ? await getAllTimeBestShows(count).catch(() => [])
      : await getAllTimeBestMovies(count).catch(() => []);
    return dedupe(fetched.map(toQuizItem)) as QuizItem[];
  };

  const fetchNextBatch = async (): Promise<QuizItem[]> => {
    const batchNumber = batchCountRef.current;
    batchCountRef.current += 1;

    const historyShare =
      batchNumber === 0 ? BATCH_SIZE : BATCH_HISTORY_SHARE;
    const fromHistory = await fetchUnratedCompletedWatches(historyShare);

    if (batchNumber === 0) {
      const stillNeeded = BATCH_SIZE - fromHistory.length;
      const randomPicks =
        stillNeeded > 0 ? await fetchRandomPopular(stillNeeded) : [];
      return shuffle([...fromHistory, ...randomPicks]);
    }

    const personalizedPicks = dedupe(
      personalizedMedia.map(toQuizItem),
    ).slice(0, BATCH_PERSONALIZED_SHARE) as QuizItem[];
    const stillNeeded =
      BATCH_SIZE - fromHistory.length - personalizedPicks.length;
    const randomPicks =
      stillNeeded > 0 ? await fetchRandomPopular(stillNeeded) : [];

    return shuffle([...fromHistory, ...personalizedPicks, ...randomPicks]);
  };

  // Initial load, once this step becomes the active one. Relies on the
  // `cancelled` flag alone (no extra "already started" ref) to stay correct
  // under StrictMode's dev-only mount→cleanup→remount double-invoke — an
  // extra ref-based guard here would survive that fake unmount and block
  // the real second invocation from ever fetching, while the first
  // invocation's result gets thrown away by cancellation. Net effect:
  // stuck forever with no state update. This is the React-recommended
  // shape for effects with cleanup.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchNextBatch()
      .then((batch) => {
        if (!cancelled) setItems(batch);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setInitialLoadDone(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Keep the queue topped up so rating never has to pause for a fetch.
  // Gated on initialLoadDone rather than items.length > 0, since a batch
  // can legitimately come back empty after dedup (e.g. everything on that
  // page was already rated in an earlier run) — items.length === 0 doesn't
  // mean "hasn't loaded yet," and treating it that way left the queue stuck
  // forever with nothing to show and no error.
  useEffect(() => {
    if (!active || !initialLoadDone) return;
    if (items.length - index > REFILL_THRESHOLD) return;
    if (refillingRef.current) return;
    refillingRef.current = true;
    fetchNextBatch()
      .then((batch) => {
        setRefillFailed(false);
        setItems((prev) => [...prev, ...batch]);
      })
      .catch(() => setRefillFailed(true))
      .finally(() => {
        refillingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, initialLoadDone, index, items.length]);

  const currentItem = items[index];

  const rate = (rating: MediaRating | null) => {
    if (currentItem && rating) {
      toggleRating(
        {
          tmdbId: String(currentItem.id),
          title: currentItem.title,
          type: mediaType,
          year: currentItem.release_date
            ? new Date(currentItem.release_date).getFullYear()
            : undefined,
          poster: currentItem.posterUrl
            ? currentItem.posterUrl
            : currentItem.poster_path
              ? getMediaPoster(currentItem.poster_path)
              : undefined,
          genreIds: currentItem.genre_ids,
        },
        rating,
      );
    }
    const nextIndex = index + 1;
    if (nextIndex % STOP_REMINDER_INTERVAL === 0) setShowStopReminder(true);
    setIndex(nextIndex);
  };

  return {
    currentItem,
    ratedCount: index,
    loadError,
    refillFailed,
    showStopReminder,
    dismissStopReminder: () => setShowStopReminder(false),
    rate,
  };
}

function RatingStep({
  heading,
  description,
  queue,
  onStop,
}: {
  heading: string;
  description: string;
  queue: RatingQueueResult;
  onStop: () => void;
}) {
  const {
    currentItem,
    ratedCount,
    loadError,
    refillFailed,
    showStopReminder,
    dismissStopReminder,
    rate,
  } = queue;

  return (
    <div className="relative">
      <h2 className="mb-1 text-lg font-semibold text-white">{heading}</h2>
      <p className="mb-4 text-sm text-type-secondary">{description}</p>
      {loadError && (
        <p className="mb-4 text-sm text-type-secondary">
          Couldn&apos;t load anything to rate. You can skip this step.
        </p>
      )}
      {currentItem ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {currentItem.posterUrl || currentItem.poster_path ? (
            <img
              src={
                currentItem.posterUrl ||
                getMediaPoster(currentItem.poster_path)
              }
              alt=""
              className="w-36 shrink-0 rounded-lg"
            />
          ) : (
            <div className="h-52 w-36 shrink-0 rounded-lg bg-white/10" />
          )}
          <div className="w-full flex-1">
            <p className="mb-1 text-xs text-type-secondary">
              Rated {ratedCount}
            </p>
            <p className="mb-3 text-xl font-semibold text-white">
              {currentItem.title}
              {currentItem.release_date
                ? ` (${new Date(currentItem.release_date).getFullYear()})`
                : ""}
            </p>
            <div className="flex flex-col gap-2">
              {RATE_CHOICES.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => rate(choice.rating)}
                  className="rounded-lg bg-white/5 px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/15"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : !loadError && !refillFailed ? (
        <p className="text-sm text-type-secondary">Loading...</p>
      ) : (
        refillFailed && (
          <p className="text-sm text-type-secondary">
            That&apos;s everything we could load for now. You can stop here.
          </p>
        )
      )}
      <div className="mt-4 flex justify-end">
        <Button theme="secondary" onClick={onStop}>
          Stop for now
        </Button>
      </div>

      {showStopReminder && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background-main/95 p-6 text-center">
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              You&apos;ve rated {ratedCount}
            </h3>
            <p className="mb-6 text-sm text-type-secondary">
              That&apos;s plenty to work with. Feel free to stop here, or
              keep going if you&apos;re having fun.
            </p>
            <div className="flex justify-center gap-3">
              <Button theme="secondary" onClick={dismissStopReminder}>
                Keep going
              </Button>
              <Button
                theme="purple"
                onClick={() => {
                  dismissStopReminder();
                  onStop();
                }}
              >
                Finish for now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CreateAlgorithmWizard({ onClose }: { onClose: () => void }) {
  const preferences = useRatingsStore((s) => s.preferences);
  const setPreferences = useRatingsStore((s) => s.setPreferences);
  const ratings = useRatingsStore((s) => s.ratings);

  const [step, setStep] = useState<WizardStep>("movies");
  const historyPrefillDone = useRef(false);

  const [genres, setGenres] = useState<Set<string>>(
    () => new Set(preferences.favoriteGenres.map(String)),
  );
  const [moods, setMoods] = useState<Set<string>>(
    () => new Set(preferences.moods),
  );
  const [franchises, setFranchises] = useState<Set<string>>(
    () => new Set(preferences.franchises),
  );

  // When entering genre/mood steps, pre-fill from completed-watch patterns
  // if the user hasn't already chosen chips (and only once per wizard open).
  useEffect(() => {
    if (step !== "genres" && step !== "moods") return;
    if (historyPrefillDone.current) return;

    let cancelled = false;
    (async () => {
      await hydrateMissingCompletedGenres(25);
      if (cancelled) return;

      const items = useWatchHistoryStore.getState().items;
      const completed: HistorySource[] = [];
      const seen = new Set<string>();
      for (const [key, item] of Object.entries(items)) {
        if (!item.completed) continue;
        const tmdbId = key.includes("-") ? key.split("-")[0]! : key;
        if (seen.has(tmdbId)) continue;
        seen.add(tmdbId);
        completed.push({
          tmdbId,
          type: item.type,
          watchedAt: item.watchedAt,
          completed: true,
          genreIds: item.genreIds,
        });
      }

      const ratingSources: RatingSource[] = Object.entries(ratings).map(
        ([tmdbId, r]) => ({
          tmdbId,
          type: r.type,
          rating: r.rating,
          genreIds: r.genreIds,
          ratedAt: r.ratedAt,
        }),
      );

      const inferred = inferPrefsFromCompletedWatches(
        completed,
        ratingSources,
      );
      historyPrefillDone.current = true;

      if (genres.size === 0 && inferred.favoriteGenres.length > 0) {
        setGenres(
          new Set(
            inferred.favoriteGenres
              .filter((id) => PICKABLE_GENRES.includes(id))
              .map(String),
          ),
        );
      }
      if (moods.size === 0 && inferred.moods.length > 0) {
        setMoods(new Set(inferred.moods));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const movieQueue = useRatingQueue("movie", step === "movies");
  const showQueue = useRatingQueue("show", step === "shows");

  const toggleIn =
    (set: Set<string>, apply: (next: Set<string>) => void) => (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      apply(next);
    };

  const finish = () => {
    setPreferences({
      favoriteGenres: Array.from(genres).map(Number),
      moods: Array.from(moods),
      franchises: Array.from(franchises),
      completedOnboarding: true,
    });
    setStep("done");
  };

  const genreOptions = useMemo(
    () =>
      PICKABLE_GENRES.map((id) => ({
        id: String(id),
        label: GENRE_LABELS[id] ?? `Genre ${id}`,
      })),
    [],
  );

  return (
    <div className="rounded-xl bg-white/5 p-6">
      {step === "movies" && (
        <RatingStep
          heading="Have you seen these movies?"
          description="We'll start with titles you've already finished when we can, then fill in with more to rate. Skip anything you haven't seen."
          queue={movieQueue}
          onStop={() => setStep("shows")}
        />
      )}

      {step === "shows" && (
        <RatingStep
          heading="What about these shows?"
          description="Same idea for TV. Finished watches first when available. Movies and shows stay separate."
          queue={showQueue}
          onStop={() => setStep("genres")}
        />
      )}

      {step === "genres" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            Which genres do you enjoy?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Pick as many as you like. We pre-select genres from what you&apos;ve
            finished watching when we can. Change anything you want.
          </p>
          <ChipGrid
            options={genreOptions}
            selected={genres}
            onToggle={toggleIn(genres, setGenres)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("shows")}>
              Back
            </Button>
            <Button theme="purple" onClick={() => setStep("moods")}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "moods" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            What are you usually in the mood for?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Pick as many as you like. We may pre-select moods from what you
            finish watching. Tweak freely.
          </p>
          <ChipGrid
            options={MOODS.map((m) => ({ id: m.id, label: m.label }))}
            selected={moods}
            onToggle={toggleIn(moods, setMoods)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("genres")}>
              Back
            </Button>
            <Button theme="purple" onClick={() => setStep("franchises")}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "franchises" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            Any favorite franchises?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Their movies and shows will get a head start in your
            suggestions.
          </p>
          <ChipGrid
            options={FRANCHISES.map((f) => ({ id: f.id, label: f.label }))}
            selected={franchises}
            onToggle={toggleIn(franchises, setFranchises)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("moods")}>
              Back
            </Button>
            <Button theme="purple" onClick={finish}>
              Finish
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Your algorithm is ready!
          </h2>
          <p className="mb-6 text-sm text-type-secondary">
            Your recommendations now reflect your taste. Keep rating what
            you watch. Every rating sharpens the suggestions.
          </p>
          <Button theme="purple" onClick={onClose}>
            See my taste profile
          </Button>
        </div>
      )}
    </div>
  );
}
