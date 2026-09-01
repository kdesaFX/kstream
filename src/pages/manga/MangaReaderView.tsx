import classNames from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getChapterPages, getMangaDetails, prefetchChapterPages } from "@/backend/manga/catalog";
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
import { readPersistedPageCache } from "@/backend/manga/pageCache";
import { isComickChapterId } from "@/backend/manga/sources/comick";
import {
  chapterLabel,
  chapterPageUrls,
  getChapterAtHome,
  proxiedChapterPageUrls,
} from "@/backend/manga/mangadex";
import type { MangaChapter, MangaDetails } from "@/backend/manga/types";
import { Icon, Icons } from "@/components/Icon";
import { ExternalListButtons } from "@/components/media/ExternalListButtons";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { mangaProgressHasMeaningfulRead } from "@/stores/mangaProgress/utils";
import { usePreferencesStore } from "@/stores/preferences";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";

import { MangaChapterPicker } from "./MangaChapterPicker";
import { MangaLanguagePicker } from "./MangaLanguagePicker";

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
    details: MangaDetails;
  } | null>(null);
  /** False until getMangaDetails finishes (partial MD may have zero chapters). */
  const [detailsReady, setDetailsReady] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
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

  const chapterId = chapterParam ? decodeURIComponent(chapterParam) : undefined;
  const externalChapter =
    chapterId &&
    (isWeebCentralId(chapterId) || isComickChapterId(chapterId));
  const canLoadChapterEarly = Boolean(
    chapterId && isDirectLoadableChapterId(chapterId),
  );
  const titleHint = slugToTitleHint(decoded?.slug);
  const pageReferrer = externalChapter ? "no-referrer" : "origin";

  // Same route serves every manga, so details are only usable for the one
  // currently in the URL — otherwise the chapter list and resume redirect below
  // would come from whichever manga was open before.
  const details =
    loadedDetails && loadedDetails.mangaId === mangaId
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
    if (!mangaId) return undefined;
    let cancelled = false;
    setError(null);
    setDetailsReady(false);
    mangaMark("reader-details-start");
    getMangaDetails(mangaId, preferredLanguage, (partial) => {
      if (!cancelled) setLoadedDetails({ mangaId, details: partial });
    })
      .then((d) => {
        if (!cancelled) {
          setLoadedDetails({ mangaId, details: d });
          setDetailsReady(true);
          mangaMark("reader-details-end");
          mangaMeasure("reader-details", "reader-details-start", "reader-details-end");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDetailsReady(true);
          setError(e instanceof Error ? e.message : "Failed to load manga");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mangaId, preferredLanguage]);

  // Redirect /manga/:id → first readable chapter or resume after meaningful read
  useEffect(() => {
    if (!mangaId || !details || chapterId) return;
    // Wait for WC/Comick merge — empty MD partial must not flash "no chapters".
    if (!detailsReady && details.chapters.length === 0) return;
    skippedEmptyRef.current = new Set();
    const resume = savedProgress[mangaId];
    const resumeStillValid =
      resume &&
      mangaProgressHasMeaningfulRead(resume) &&
      details.chapters.some((ch) => ch.id === resume.chapterId);
    const firstReadable =
      details.chapters.find(
        (ch) =>
          (ch.pages ?? 0) > 0 ||
          ch.source === "weebcentral" ||
          ch.source === "comick",
      )?.id ?? details.chapters[0]?.id;
    const target = resumeStillValid ? resume.chapterId : firstReadable;
    if (target) {
      navigate(mangaChapterLink(details.id, details.title, target), {
        replace: true,
      });
    } else if (detailsReady) {
      setError(t("manga.reader.noChapters"));
      setLoading(false);
    }
  }, [mangaId, details, detailsReady, chapterId, savedProgress, navigate, t]);

  // Drop chapter ids that aren't in the current language's list (wrong-series
  // leftover, or we just switched translation). Prefer the same chapter number.
  useEffect(() => {
    if (!mangaId || !details || !chapterId) return;
    if (details.chapters.some((ch) => ch.id === chapterId)) return;
    const wanted = lastChapterNumber.current;
    const match = wanted
      ? details.chapters.find((ch) => ch.chapter === wanted)
      : undefined;
    const fallback = match?.id ?? details.chapters[0]?.id;
    if (!fallback) return;
    navigate(mangaChapterLink(details.id, details.title, fallback), {
      replace: true,
    });
  }, [mangaId, details, chapterId, navigate]);

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
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      if (force) {
        retried.current = false;
        skippedEmptyRef.current.delete(id);
      }
      try {
        mangaMark("reader-pages-start");
        if (canUseMangaOffline()) {
          const offlinePages = await getDesktopOfflineMangaPages(id);
          if (offlinePages?.length) {
            pagesLoadedRef.current = true;
            needsDetailsRetryRef.current = false;
            setPages(offlinePages);
            if (!silent) setPageIndex(0);
            setOfflineSaved(true);
            if (!silent) setLoading(false);
            return;
          }
        }
        const urls = await getChapterPages(id, pageFallback(), force);
        if (urls.length === 0) {
          if (!silent) {
            needsDetailsRetryRef.current = !detailsReady;
            skippedEmptyRef.current.add(id);
            const idx = chapters.findIndex((c) => c.id === id);
            const nextReadable =
              idx >= 0
                ? chapters
                    .slice(idx + 1)
                    .find((c) => !skippedEmptyRef.current.has(c.id))
                : undefined;
            if (nextReadable && details) {
              skipChapterResumeRef.current = true;
              navigate(
                mangaChapterLink(details.id, details.title, nextReadable.id),
                { replace: true },
              );
              return;
            }
            setError(t("manga.reader.emptyChapter"));
            setPages([]);
            pagesLoadedRef.current = false;
          }
          return;
        }
        pagesLoadedRef.current = true;
        needsDetailsRetryRef.current = false;
        setPages(urls);
        if (!silent) setPageIndex(0);
        if (canUseMangaOffline()) {
          void hasDesktopOfflineMangaChapter(id).then(setOfflineSaved);
        }
        mangaMark("reader-pages-end");
        mangaMeasure("reader-pages", "reader-pages-start", "reader-pages-end");
      } catch (e) {
        if (!silent) {
          needsDetailsRetryRef.current = !detailsReady;
          pagesLoadedRef.current = false;
          setError(e instanceof Error ? e.message : "Failed to load pages");
          setPages([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      t,
      details,
      chapters,
      detailsReady,
      pageFallback,
      navigate,
    ],
  );

  useEffect(() => {
    if (!chapterId) return;
    pagesLoadedRef.current = false;
    needsDetailsRetryRef.current = false;
    retried.current = false;
    setOfflineSaved(false);

    const cached = readPersistedPageCache(chapterId);
    if (cached?.length) {
      setPages(cached);
      setPageIndex(0);
      setLoading(false);
      pagesLoadedRef.current = true;
      void loadPages(chapterId, true, true);
      return;
    }
    if (canUseMangaOffline()) {
      void getDesktopOfflineMangaPages(chapterId).then((offline) => {
        if (!offline?.length) return;
        setPages(offline);
        setPageIndex(0);
        setLoading(false);
        pagesLoadedRef.current = true;
        setOfflineSaved(true);
        void loadPages(chapterId, true, true);
      });
      return;
    }
    setPages([]);
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chapterId) return;
    if (canLoadChapterEarly && !details) {
      needsDetailsRetryRef.current = true;
      void loadPages(chapterId);
      return;
    }
    if (!details) return;
    if (pagesLoadedRef.current) return;
    void loadPages(chapterId);
  }, [chapterId, canLoadChapterEarly, details?.id, loadPages]);

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
    void loadPages(chapterId);
  }, [
    chapterId,
    chapterNumberHint,
    details?.title,
    titleHint,
    detailsReady,
    loadPages,
  ]);

  // Warm nearby chapters so random picks from the list feel faster.
  useEffect(() => {
    if (pages.length === 0 || chapterIndex < 0) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const nearby = chapters.slice(
        Math.max(0, chapterIndex - 3),
        Math.min(chapters.length, chapterIndex + 4),
      );
      for (const ch of nearby) {
        if (ch.id !== chapterId) prefetchChapter(ch);
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    pages.length,
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

  // Persist progress only after pageIndex belongs to this chapter.
  useEffect(() => {
    if (!details || !chapterId || !currentChapter || pages.length === 0) return;
    if (pageChapterIdRef.current !== chapterId) return;
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
    setPageIndex(0);
    resetVerticalScroll(0);
    navigate(mangaChapterLink(details.id, details.title, ch.id));
  };

  const turnPage = useCallback(
    (delta: number) => {
      const next = pageIndex + delta;
      if (next >= 0 && next < pages.length) {
        setPageIndex(next);
        return;
      }
      if (delta > 0 && nextChapter) goChapter(nextChapter);
      if (delta < 0 && prevChapter) goChapter(prevChapter);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageIndex, pages.length, nextChapter, prevChapter, details],
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

      {!loading && !error && pages.length > 0 ? (
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
                  if (max <= 0 || pages.length === 0) return;
                  const ratio = el.scrollTop / max;
                  const idx = Math.min(
                    pages.length - 1,
                    Math.floor(ratio * pages.length),
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
              {pages.map((src, i) => (
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
                src={pages[pageIndex]}
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
                max={Math.max(pages.length - 1, 0)}
                value={pageIndex}
                onChange={(e) => setPageIndex(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-white/70 tabular-nums">
                {pages.length ? pageIndex + 1 : 0}/{pages.length}
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
