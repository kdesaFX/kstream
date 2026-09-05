import classNames from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getChapterPages, getMangaDetails, prefetchChapterPages, clearChapterPagesCache } from "@/backend/manga/catalog";
import {
  canUseMangaOffline,
  downloadDesktopMangaChapter,
  getDesktopOfflineMangaPages,
  hasDesktopOfflineMangaChapter,
} from "@/backend/manga/mangaDesktopOffline";
import {
  decodeMangaId,
  isDirectLoadableChapterId,
  isWeebCentralId,
  mangaChapterLink,
  mangaMediaLink,
  slugToTitleHint,
} from "@/backend/manga/ids";
import { mangaMark, mangaMeasure } from "@/backend/manga/mangaTiming";
import {
  clearPersistedPageCache,
  readPersistedPageCache,
} from "@/backend/manga/pageCache";
import { isComickChapterId } from "@/backend/manga/sources/comick";
import {
  chapterLabel,
  chapterPageUrls,
  getChapterAtHome,
  proxiedChapterPageUrls,
} from "@/backend/manga/mangadex";
import type { MangaChapter, MangaDetails } from "@/backend/manga/types";
import { pagesValidForManga } from "@/backend/manga/weebcentral";
import { Icon, Icons } from "@/components/Icon";
import { ExternalListButtons } from "@/components/media/ExternalListButtons";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { mangaProgressHasMeaningfulRead } from "@/stores/mangaProgress/utils";
import { usePreferencesStore } from "@/stores/preferences";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";

import { MangaChapterPicker } from "./MangaChapterPicker";
import { MangaLanguagePicker } from "./MangaLanguagePicker";

/** Prefer chapters that already advertise pages or come from a mirror host. */
function isLikelyReadableChapter(ch: MangaChapter): boolean {
  return (
    (ch.pages ?? 0) > 0 ||
    ch.source === "weebcentral" ||
    ch.source === "comick"
  );
}

function PageImage({
  src,
  alt,
  referrerPolicy,
  eager,
  onError,
  onLoad,
}: {
  src: string;
  alt: string;
  referrerPolicy: "origin" | "no-referrer";
  eager?: boolean;
  onError: () => void;
  onLoad?: () => void;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className="max-w-full h-auto mx-auto block bg-black/40"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      // MangaDex image nodes drop requests that carry no referrer at all, so
      // send the bare origin. WeebCentral's CDN is the opposite: a foreign
      // referrer can get you a placeholder, so those pages go out with none.
      referrerPolicy={referrerPolicy}
      onError={onError}
      onLoad={onLoad}
      draggable={false}
    />
  );
}

export function MangaReaderView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { media: mediaParam, chapter: chapterParam } = useParams<{
    media: string;
    chapter?: string;
  }>();

  const preferredLanguage = usePreferencesStore(
    (s) => s.mangaPreferredLanguage,
  );
  const setMangaPreferredLanguage = usePreferencesStore(
    (s) => s.setMangaPreferredLanguage,
  );
  const readerMode = usePreferencesStore((s) => s.mangaReaderMode);
  const setReaderMode = usePreferencesStore((s) => s.setMangaReaderMode);
  const updateProgress = useMangaProgressStore((s) => s.updateProgress);
  const savedProgress = useMangaProgressStore((s) => s.items);

  const decoded = mediaParam ? decodeMangaId(mediaParam) : null;
  const mangaId = decoded?.id;

  const [loadedDetails, setLoadedDetails] = useState<{
    mangaId: string;
    language: string;
    details: MangaDetails;
  } | null>(null);
  /** False until getMangaDetails finishes (partial MD may have zero chapters). */
  const [detailsReady, setDetailsReady] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  /** React state (not ref) so rapid Next can't paint pages for the wrong chapter. */
  const [pagesForChapterId, setPagesForChapterId] = useState<
    string | undefined
  >(undefined);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [offlineSaving, setOfflineSaving] = useState(false);
  const isDesktop = useIsDesktopApp();
  const touchStartX = useRef<number | null>(null);
  const retried = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageChapterIdRef = useRef<string | undefined>(undefined);
  const skipChapterResumeRef = useRef(false);
  /** Empty stubs we already bounced past so we don't loop forever. */
  const skippedEmptyRef = useRef<Set<string>>(new Set());
  const needsDetailsRetryRef = useRef(false);
  const pagesLoadedRef = useRef(false);
  /** Bumps on every loadPages start so concurrent fetches can't both paint. */
  const loadGenerationRef = useRef(0);
  /** Set synchronously in goChapter so loads know the chapter number before URL settles. */
  const pendingChapterRef = useRef<{
    id: string;
    chapter: string | null;
  } | null>(null);

  const chapterId = chapterParam ? decodeURIComponent(chapterParam) : undefined;
  const chapterIdRef = useRef(chapterId);
  chapterIdRef.current = chapterId;
  const externalChapter =
    chapterId &&
    (isWeebCentralId(chapterId) || isComickChapterId(chapterId));
  const canLoadChapterEarly = Boolean(
    chapterId && isDirectLoadableChapterId(chapterId),
  );
  const titleHint = slugToTitleHint(decoded?.slug);
  const pageReferrer = externalChapter ? "no-referrer" : "origin";

  // Same route serves every manga/language, so details are only usable when both
  // match — otherwise language switches keep a stale chapter list mounted.
  const details =
    loadedDetails &&
    loadedDetails.mangaId === mangaId &&
    loadedDetails.language === preferredLanguage
      ? loadedDetails.details
      : null;

  const chapters = details?.chapters ?? [];
  const chapterIndex = chapters.findIndex((c) => c.id === chapterId);
  const lastChapterNumber = useRef<string | null>(null);
  const currentChapter: MangaChapter | undefined =
    chapterIndex >= 0 ? chapters[chapterIndex] : undefined;
  const chapterNumberHint =
    currentChapter?.chapter ??
    (chapterId && details
      ? details.chapters.find((c) => c.id === chapterId)?.chapter ?? null
      : null);
  const chapterMeta =
    currentChapter ??
    (chapterId && details
      ? details.chapters.find((c) => c.id === chapterId)
      : undefined);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : undefined;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1
      ? chapters[chapterIndex + 1]
      : undefined;

  // Never paint page URLs that belong to a different chapter id, or whose
  // CDN prefixes disagree with the chapter label (last line of defense).
  const visiblePages = (() => {
    if (pagesForChapterId !== chapterId) return [];
    if (!pages.length) return [];
    if (
      chapterNumberHint &&
      !pagesValidForManga(
        pages,
        details?.title ?? titleHint,
        details?.alternateTitles ?? [],
        chapterNumberHint,
      )
    ) {
      return [];
    }
    return pages;
  })();

  const direction =
    details?.readingDirection ??
    savedProgress[mangaId ?? ""]?.readingDirection ??
    "ltr";

  useEffect(() => {
    if (currentChapter?.chapter != null) {
      lastChapterNumber.current = currentChapter.chapter;
    }
  }, [currentChapter]);

  // Load manga details
  useEffect(() => {
    if (!mediaParam) return undefined;
    if (!mangaId) {
      setDetailsReady(true);
      setLoading(false);
      setError(t("manga.reader.invalidLink", "This manga link is invalid."));
      return undefined;
    }
    let cancelled = false;
    loadGenerationRef.current += 1;
    skippedEmptyRef.current = new Set();
    pagesLoadedRef.current = false;
    needsDetailsRetryRef.current = false;
    setPages([]);
    setPagesForChapterId(undefined);
    setError(null);
    setDetailsReady(false);
    setLoading(true);
    mangaMark("reader-details-start");
    getMangaDetails(mangaId, preferredLanguage, (partial) => {
      if (!cancelled) {
        setLoadedDetails({
          mangaId,
          language: preferredLanguage,
          details: partial,
        });
      }
    })
      .then((d) => {
        if (!cancelled) {
          setLoadedDetails({
            mangaId,
            language: preferredLanguage,
            details: d,
          });
          setDetailsReady(true);
          mangaMark("reader-details-end");
          mangaMeasure("reader-details", "reader-details-start", "reader-details-end");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDetailsReady(true);
          setError(e instanceof Error ? e.message : "Failed to load manga");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mangaId, mediaParam, preferredLanguage, t]);

  // Redirect /manga/:id → first readable chapter or resume after meaningful read.
  // Wait for mirror merge — partial MangaDex stubs auto-skip all the way to the end.
  useEffect(() => {
    if (!mangaId || !details || chapterId || !detailsReady) return;
    skippedEmptyRef.current = new Set();
    const resume = savedProgress[mangaId];
    const resumeStillValid =
      resume &&
      mangaProgressHasMeaningfulRead(resume) &&
      details.chapters.some((ch) => ch.id === resume.chapterId);
    // Prefer WeebCentral over hollow Comick stubs (pages often CF-blocked).
    const firstReadable =
      details.chapters.find((ch) => ch.source === "weebcentral")?.id ??
      details.chapters.find((ch) => isLikelyReadableChapter(ch))?.id ??
      details.chapters[0]?.id;
    const target = resumeStillValid ? resume.chapterId : firstReadable;
    if (target) {
      navigate(mangaChapterLink(details.id, details.title, target), {
        replace: true,
      });
    } else {
      setError(t("manga.reader.noChapters"));
      setLoading(false);
    }
  }, [mangaId, details, detailsReady, chapterId, savedProgress, navigate, t]);

  // Drop chapter ids that aren't in the current language's list (wrong-series
  // leftover, or we just switched translation). Prefer the same chapter number.
  useEffect(() => {
    if (!mangaId || !details || !chapterId || !detailsReady) return;
    if (details.chapters.some((ch) => ch.id === chapterId)) return;
    const wanted = lastChapterNumber.current;
    const match = wanted
      ? details.chapters.find(
          (ch) => ch.chapter === wanted && isLikelyReadableChapter(ch),
        ) ?? details.chapters.find((ch) => ch.chapter === wanted)
      : undefined;
    const fallback =
      match?.id ??
      details.chapters.find((ch) => isLikelyReadableChapter(ch))?.id ??
      details.chapters[0]?.id;
    if (!fallback) {
      setError(t("manga.reader.noChapters"));
      setLoading(false);
      return;
    }
    skippedEmptyRef.current = new Set();
    navigate(mangaChapterLink(details.id, details.title, fallback), {
      replace: true,
    });
  }, [mangaId, details, detailsReady, chapterId, navigate, t]);

  const pageFallback = useCallback(
    () => ({
      mangaId: details?.id ?? mangaId,
      language: preferredLanguage,
      title: details?.title ?? titleHint,
      alternateTitles: details?.alternateTitles,
      chapter: chapterNumberHint,
      mangadexStub:
        (chapterMeta?.source ?? "mangadex") === "mangadex" &&
        (chapterMeta?.pages ?? 0) === 0,
    }),
    [
      details?.id,
      details?.title,
      details?.alternateTitles,
      mangaId,
      preferredLanguage,
      titleHint,
      chapterNumberHint,
      chapterMeta?.source,
      chapterMeta?.pages,
    ],
  );

  const prefetchChapter = useCallback(
    (ch: MangaChapter) => {
      prefetchChapterPages(ch.id, {
        mangaId: details?.id ?? mangaId,
        language: preferredLanguage,
        title: details?.title ?? titleHint,
        alternateTitles: details?.alternateTitles,
        chapter: ch.chapter,
        mangadexStub:
          (ch.source ?? "mangadex") === "mangadex" && (ch.pages ?? 0) === 0,
      });
    },
    [
      details?.id,
      details?.title,
      details?.alternateTitles,
      mangaId,
      preferredLanguage,
      titleHint,
    ],
  );

  const loadPages = useCallback(
    async (id: string, force = false, silent = false) => {
      // Each call gets a unique generation so rapid Next / duplicate effects
      // can't both paint — only the latest load wins.
      loadGenerationRef.current += 1;
      const generation = loadGenerationRef.current;
      const isStale = () =>
        generation !== loadGenerationRef.current ||
        id !== chapterIdRef.current;

      if (!silent) {
        setLoading(true);
        setError(null);
      }
      if (force) {
        retried.current = false;
        skippedEmptyRef.current.delete(id);
        clearChapterPagesCache(id);
      }
      try {
        mangaMark("reader-pages-start");
        if (canUseMangaOffline()) {
          const offlinePages = await getDesktopOfflineMangaPages(id);
          if (isStale()) return;
          if (offlinePages?.length) {
            pagesLoadedRef.current = true;
            needsDetailsRetryRef.current = false;
            setPagesForChapterId(id);
            setPages(offlinePages);
            if (!silent) setPageIndex(0);
            setOfflineSaved(true);
            if (!silent) setLoading(false);
            return;
          }
        }
        const fallback = pageFallback();
        // Prefer the number for THIS id (list or pending Next target) — never
        // a stale chapterNumberHint from the previous chapter.
        const chapterForId =
          details?.chapters.find((c) => c.id === id)?.chapter ??
          (pendingChapterRef.current?.id === id
            ? pendingChapterRef.current.chapter
            : null) ??
          null;

        // Mirror ids without a chapter number are unsafe during rapid Next —
        // wait for the chapter list / pending meta instead of painting ungated.
        if (
          !chapterForId &&
          (isWeebCentralId(id) || isComickChapterId(id)) &&
          !detailsReady
        ) {
          needsDetailsRetryRef.current = true;
          if (!silent) setLoading(true);
          return;
        }

        const urls = await getChapterPages(
          id,
          { ...fallback, chapter: chapterForId },
          force,
          isStale,
        );
        if (isStale()) return;
        if (urls.length === 0) {
          if (!silent) {
            if (!detailsReady) {
              needsDetailsRetryRef.current = true;
              return;
            }
            setError(t("manga.reader.emptyChapter"));
            setPagesForChapterId(id);
            setPages([]);
            pagesLoadedRef.current = false;
          }
          return;
        }
        if (
          chapterForId &&
          !pagesValidForManga(
            urls,
            fallback.title,
            fallback.alternateTitles ?? [],
            chapterForId,
          )
        ) {
          clearChapterPagesCache(id);
          if (!silent) {
            setError(t("manga.reader.emptyChapter"));
            setPagesForChapterId(id);
            setPages([]);
            pagesLoadedRef.current = false;
          }
          return;
        }
        pagesLoadedRef.current = true;
        needsDetailsRetryRef.current = false;
        setPagesForChapterId(id);
        setPages(urls);
        if (!silent) setPageIndex(0);
        if (canUseMangaOffline()) {
          void hasDesktopOfflineMangaChapter(id).then((saved) => {
            if (!isStale()) setOfflineSaved(saved);
          });
        }
        mangaMark("reader-pages-end");
        mangaMeasure("reader-pages", "reader-pages-start", "reader-pages-end");
      } catch (e) {
        if (!silent && !isStale()) {
          needsDetailsRetryRef.current = !detailsReady;
          pagesLoadedRef.current = false;
          setError(e instanceof Error ? e.message : "Failed to load pages");
          setPagesForChapterId(id);
          setPages([]);
        }
      } finally {
        if (!silent && !isStale()) setLoading(false);
      }
    },
    [t, details, detailsReady, pageFallback],
  );

  useEffect(() => {
    if (!chapterId) return;
    // Invalidate any in-flight load from the previous chapter immediately.
    loadGenerationRef.current += 1;
    pagesLoadedRef.current = false;
    needsDetailsRetryRef.current = false;
    retried.current = false;
    setOfflineSaved(false);
    setPagesForChapterId(undefined);
    setPages([]);
    setPageIndex(0);
    setLoading(true);
    setError(null);
    clearChapterPagesCache(chapterId);

    const requestedId = chapterId;
    // Rapid Next fires many chapter changes — only fetch after navigation
    // settles so we don't storm WeebCentral and paint a stale response.
    const timer = window.setTimeout(() => {
      if (requestedId !== chapterIdRef.current) return;

      const titleForCheck = details?.title ?? titleHint;
      const alts = details?.alternateTitles ?? [];
      const chapterForCheck =
        details?.chapters.find((c) => c.id === requestedId)?.chapter ??
        (pendingChapterRef.current?.id === requestedId
          ? pendingChapterRef.current.chapter
          : null) ??
        null;

      const cached = readPersistedPageCache(requestedId, chapterForCheck);
      if (cached?.length) {
        const canTrustCache =
          chapterForCheck &&
          pagesValidForManga(cached, titleForCheck, alts, chapterForCheck);
        if (!canTrustCache) {
          clearPersistedPageCache(requestedId);
        } else {
          setPagesForChapterId(requestedId);
          setPages(cached);
          setLoading(false);
          pagesLoadedRef.current = true;
          void loadPages(requestedId, true, true);
          return;
        }
      }
      if (canUseMangaOffline()) {
        void getDesktopOfflineMangaPages(requestedId).then((offline) => {
          if (requestedId !== chapterIdRef.current) return;
          if (!offline?.length) return;
          if (
            !chapterForCheck ||
            !pagesValidForManga(offline, titleForCheck, alts, chapterForCheck)
          ) {
            return;
          }
          setPagesForChapterId(requestedId);
          setPages(offline);
          setPageIndex(0);
          setLoading(false);
          pagesLoadedRef.current = true;
          setOfflineSaved(true);
          void loadPages(requestedId, true, true);
        });
        return;
      }
      void loadPages(requestedId, true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once chapter number is known, drop painted pages that belong to another ch.
  useEffect(() => {
    if (!chapterId || !chapterNumberHint || pages.length === 0) return;
    if (pagesForChapterId !== chapterId) return;
    const titleForCheck = details?.title ?? titleHint;
    if (
      titleForCheck &&
      !pagesValidForManga(
        pages,
        titleForCheck,
        details?.alternateTitles ?? [],
        chapterNumberHint,
      )
    ) {
      clearPersistedPageCache(chapterId);
      pagesLoadedRef.current = false;
      setPagesForChapterId(undefined);
      setPages([]);
      void loadPages(chapterId, true);
    }
  }, [
    chapterId,
    chapterNumberHint,
    details?.title,
    details?.alternateTitles,
    titleHint,
    pages,
    pagesForChapterId,
    loadPages,
  ]);

  // Details arrived for the current chapter — load if the settle timer left us empty.
  useEffect(() => {
    if (!chapterId || !details) return;
    if (pagesLoadedRef.current) return;
    if (canLoadChapterEarly && !detailsReady) {
      needsDetailsRetryRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      if (chapterId !== chapterIdRef.current) return;
      if (pagesLoadedRef.current) return;
      void loadPages(chapterId, true);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [canLoadChapterEarly, details, detailsReady, chapterId, loadPages]);

  useEffect(() => {
    if (!chapterId || !detailsReady || !details) return;
    if (pagesLoadedRef.current) return;
    if (!needsDetailsRetryRef.current) return;
    void loadPages(chapterId, true);
  }, [chapterId, details, detailsReady, loadPages]);

  // Partial MangaDex list often has the chapter number before WC/Comick merge.
  // Retry page load as soon as we know "82.1" so WeebCentral lookup can run early.
  useEffect(() => {
    if (!chapterId || !chapterNumberHint) return;
    if (pagesLoadedRef.current || detailsReady) return;
    if (!details?.title && !titleHint) return;
    const timer = window.setTimeout(() => {
      if (chapterId !== chapterIdRef.current) return;
      if (pagesLoadedRef.current) return;
      void loadPages(chapterId);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [
    chapterId,
    chapterNumberHint,
    details?.title,
    titleHint,
    detailsReady,
    loadPages,
  ]);

  // Prefetch only the immediate neighbor after the reader has settled — never
  // warm ±3 during rapid Next (that storm was feeding wrong-chapter responses).
  useEffect(() => {
    if (pages.length === 0 || chapterIndex < 0 || !chapterId) return undefined;
    if (pagesForChapterId !== chapterId) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const neighbors = [chapters[chapterIndex - 1], chapters[chapterIndex + 1]];
      for (const ch of neighbors) {
        if (ch?.id && ch.id !== chapterId) prefetchChapter(ch);
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    pages.length,
    pagesForChapterId,
    chapterId,
    chapterIndex,
    chapters,
    prefetchChapter,
  ]);

  const resetVerticalScroll = useCallback((top = 0) => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const el = scrollRef.current;
    if (el) el.scrollTop = top;
  }, []);

  // Keep pageIndex tied to the chapter in the URL so we never persist the
  // previous chapter's last page onto the next one (that left readers at the
  // bottom after hitting Next).
  useEffect(() => {
    if (!chapterId) return;
    if (pageChapterIdRef.current === chapterId) return;
    pageChapterIdRef.current = chapterId;
    setPageIndex(0);
    resetVerticalScroll(0);
  }, [chapterId, resetVerticalScroll]);

  // Resume page within chapter (Continue Reading), not after Next/Prev.
  useEffect(() => {
    if (!mangaId || !chapterId || pages.length === 0) return;
    if (pageChapterIdRef.current !== chapterId) return;

    const resume = savedProgress[mangaId];
    const shouldResume =
      !skipChapterResumeRef.current &&
      resume?.chapterId === chapterId &&
      resume.page > 0;
    skipChapterResumeRef.current = false;

    const startPage = shouldResume
      ? Math.min(resume.page, pages.length - 1)
      : 0;
    setPageIndex(startPage);

    if (readerMode !== "vertical") return;

    const apply = () => {
      if (startPage === 0) {
        resetVerticalScroll(0);
        return;
      }
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) el.scrollTop = (startPage / pages.length) * max;
    };

    apply();
    const frame = requestAnimationFrame(apply);
    const later = window.setTimeout(apply, 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, [mangaId, chapterId, pages.length, readerMode, resetVerticalScroll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist progress only after real pages belong to this chapter.
  useEffect(() => {
    if (!details || !chapterId || !currentChapter || pages.length === 0) return;
    if (pageChapterIdRef.current !== chapterId) return;
    // Never seed resume from an empty/auto-landed stub or a single unopened page.
    if (pageIndex === 0 && pages.length > 1) return;
    updateProgress({
      mangaId: details.id,
      title: details.title,
      poster: details.poster,
      year: details.year,
      chapterId,
      chapterLabel: chapterLabel(currentChapter),
      page: pageIndex,
      totalPages: pages.length,
      readingDirection: details.readingDirection,
      tags: details.tags,
    });
  }, [
    details,
    chapterId,
    currentChapter,
    pageIndex,
    pages.length,
    updateProgress,
  ]);

  const goChapter = (ch?: MangaChapter) => {
    if (!details || !ch) return;
    skipChapterResumeRef.current = ch.id !== chapterId;
    pageChapterIdRef.current = ch.id;
    pendingChapterRef.current = {
      id: ch.id,
      chapter: ch.chapter ?? null,
    };
    // Invalidate in-flight loads immediately (before the URL/effect catches up).
    loadGenerationRef.current += 1;
    pagesLoadedRef.current = false;
    setPagesForChapterId(undefined);
    setPages([]);
    setPageIndex(0);
    setError(null);
    resetVerticalScroll(0);
    navigate(mangaChapterLink(details.id, details.title, ch.id));
  };

  const turnPage = useCallback(
    (delta: number) => {
      const next = pageIndex + delta;
      if (next >= 0 && next < visiblePages.length) {
        setPageIndex(next);
        return;
      }
      if (delta > 0 && nextChapter) goChapter(nextChapter);
      if (delta < 0 && prevChapter) goChapter(prevChapter);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageIndex, visiblePages.length, nextChapter, prevChapter, details],
  );

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        navigate(details ? mangaMediaLink(details.id, details.title) : "/");
        return;
      }
      if (readerMode !== "paged") {
        if (e.key === "ArrowLeft")
          goChapter(direction === "rtl" ? nextChapter : prevChapter);
        if (e.key === "ArrowRight")
          goChapter(direction === "rtl" ? prevChapter : nextChapter);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === " ") {
        e.preventDefault();
        turnPage(direction === "rtl" ? 1 : -1);
      }
      if (e.key === "ArrowRight") {
        turnPage(direction === "rtl" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPageError = async (index: number) => {
    if (!chapterId || retried.current) return;
    if (externalChapter) return;
    retried.current = true;
    try {
      const atHome = await getChapterAtHome(chapterId);
      const urls = chapterPageUrls(atHome, "data-saver");
      if (urls[index]) {
        setPages((prev) => {
          const copy = [...prev];
          copy[index] = proxiedChapterPageUrls([urls[index]])[0] ?? urls[index];
          return copy;
        });
      }
    } catch {
      // leave broken image
    }
  };

  const saveChapterOffline = useCallback(async () => {
    if (!chapterId || !pages.length || offlineSaving) return;
    setOfflineSaving(true);
    try {
      await downloadDesktopMangaChapter({
        chapterId,
        mangaId,
        title: details?.title ?? titleHint,
        chapterLabel: chapterMeta?.chapter ?? chapterNumberHint ?? undefined,
        pages,
      });
      setOfflineSaved(true);
    } catch {
      setError(t("manga.reader.offlineSaveFailed"));
    } finally {
      setOfflineSaving(false);
    }
  }, [
    chapterId,
    pages,
    offlineSaving,
    mangaId,
    details?.title,
    titleHint,
    chapterMeta?.chapter,
    chapterNumberHint,
    t,
  ]);

  const title = details?.title ?? t("manga.reader.loading");

  return (
    <div className="min-h-screen bg-black text-white relative">
      <Helmet>
        <title>
          {currentChapter
            ? `${title} — ${chapterLabel(currentChapter)}`
            : title}
        </title>
        <html data-no-scroll="true" />
      </Helmet>

      {/* Top controls */}
      <div
        className={classNames(
          "fixed top-0 inset-x-0 z-30 transition-opacity duration-200",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/90 to-transparent">
          <Link
            to="/"
            className="p-2 rounded-full hover:bg-white/10"
            aria-label="Home"
          >
            <Icon icon={Icons.ARROW_LEFT} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="truncate font-semibold text-sm">{title}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <MangaChapterPicker
                chapters={chapters}
                currentChapterId={chapterId}
                onSelect={(ch) => goChapter(ch)}
                onPrefetch={prefetchChapter}
              />
              <MangaLanguagePicker
                languages={
                  details?.availableLanguages?.length
                    ? details.availableLanguages
                    : [preferredLanguage]
                }
                selected={preferredLanguage}
                onSelect={(code) => {
                  if (code === preferredLanguage) return;
                  setMangaPreferredLanguage(code);
                }}
              />
            </div>
          </div>
          {details ? (
            <ExternalListButtons
              type="MANGA"
              variant="reader"
              titles={[details.title, ...(details.alternateTitles ?? [])]}
            />
          ) : null}
          {isDesktop && canUseMangaOffline() && pages.length > 0 ? (
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50"
              disabled={offlineSaving || offlineSaved}
              onClick={() => void saveChapterOffline()}
            >
              {offlineSaving
                ? t("manga.reader.offlineSaving")
                : offlineSaved
                  ? t("manga.reader.offlineSaved")
                  : t("manga.reader.offlineSave")}
            </button>
          ) : null}
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20"
            onClick={() =>
              setReaderMode(readerMode === "vertical" ? "paged" : "vertical")
            }
          >
            {readerMode === "vertical"
              ? t("manga.reader.modePaged")
              : t("manga.reader.modeVertical")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-screen text-white/60">
          {t("manga.reader.loading")}
        </div>
      ) : null}
      {error ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-red-300 px-6 text-center">
          <p>{error}</p>
          {chapterId ? (
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white/10"
              onClick={() => loadPages(chapterId, true)}
            >
              {t("manga.reader.retry")}
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && visiblePages.length > 0 ? (
        <div
          ref={scrollRef}
          className={classNames(
            readerMode === "vertical"
              ? "fixed inset-0 overflow-y-auto overscroll-contain pt-14 pb-20 [overflow-anchor:none]"
              : "pt-14 pb-20 flex items-center justify-center min-h-screen",
          )}
          onClick={() => setControlsVisible((v) => !v)}
          onScroll={
            readerMode === "vertical"
              ? (e) => {
                  const el = e.currentTarget;
                  const max = el.scrollHeight - el.clientHeight;
                  if (max <= 0 || visiblePages.length === 0) return;
                  const ratio = el.scrollTop / max;
                  const idx = Math.min(
                    visiblePages.length - 1,
                    Math.floor(ratio * visiblePages.length),
                  );
                  if (idx !== pageIndex) setPageIndex(idx);
                }
              : undefined
          }
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (readerMode !== "paged" || touchStartX.current == null) return;
            const end = e.changedTouches[0]?.clientX;
            if (end == null) return;
            const dx = end - touchStartX.current;
            if (Math.abs(dx) < 50) return;
            if (dx > 0) turnPage(direction === "rtl" ? 1 : -1);
            else turnPage(direction === "rtl" ? -1 : 1);
          }}
        >
          {readerMode === "vertical" ? (
            <div className="max-w-3xl mx-auto flex flex-col gap-1">
              {visiblePages.map((src, i) => (
                <PageImage
                  key={`${chapterId}-${i}`}
                  src={src}
                  alt={`Page ${i + 1}`}
                  referrerPolicy={pageReferrer}
                  eager={i < 3}
                  onError={() => onPageError(i)}
                  onLoad={
                    i === 0 && pageIndex === 0
                      ? () => resetVerticalScroll(0)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="w-full max-w-4xl px-2">
              <PageImage
                src={visiblePages[pageIndex]}
                alt={`Page ${pageIndex + 1}`}
                referrerPolicy={pageReferrer}
                eager
                onError={() => onPageError(pageIndex)}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* Bottom controls */}
      <div
        className={classNames(
          "fixed bottom-0 inset-x-0 z-30 transition-opacity duration-200",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="px-4 py-3 bg-gradient-to-t from-black/90 to-transparent flex items-center gap-3">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-white/10 text-sm disabled:opacity-30"
            disabled={!prevChapter}
            onClick={() => goChapter(prevChapter)}
          >
            {t("manga.reader.prevChapter")}
          </button>
          {readerMode === "paged" ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(visiblePages.length - 1, 0)}
                value={pageIndex}
                onChange={(e) => setPageIndex(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-white/70 tabular-nums">
                {visiblePages.length ? pageIndex + 1 : 0}/{visiblePages.length}
              </span>
            </div>
          ) : (
            <div className="flex-1 text-center text-xs text-white/50">
              {t("manga.reader.scrollHint")}
            </div>
          )}
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-white/10 text-sm disabled:opacity-30"
            disabled={!nextChapter}
            onClick={() => goChapter(nextChapter)}
          >
            {t("manga.reader.nextChapter")}
          </button>
        </div>
      </div>
    </div>
  );
}
