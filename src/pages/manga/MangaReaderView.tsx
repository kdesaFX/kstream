import classNames from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getChapterPages, getMangaDetails } from "@/backend/manga/catalog";
import {
  decodeMangaId,
  isWeebCentralId,
  mangaChapterLink,
  mangaMediaLink,
} from "@/backend/manga/ids";
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
  const [pages, setPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const retried = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageChapterIdRef = useRef<string | undefined>(undefined);
  const skipChapterResumeRef = useRef(false);

  const chapterId = chapterParam ? decodeURIComponent(chapterParam) : undefined;
  const externalChapter =
    chapterId &&
    (isWeebCentralId(chapterId) || isComickChapterId(chapterId));
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
    getMangaDetails(mangaId, preferredLanguage)
      .then((d) => {
        if (!cancelled) setLoadedDetails({ mangaId, details: d });
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load manga");
      });
    return () => {
      cancelled = true;
    };
  }, [mangaId, preferredLanguage]);

  // Redirect /manga/:id → first chapter or resume after meaningful read
  useEffect(() => {
    if (!mangaId || !details || chapterId) return;
    const resume = savedProgress[mangaId];
    const resumeStillValid =
      resume &&
      mangaProgressHasMeaningfulRead(resume) &&
      details.chapters.some((ch) => ch.id === resume.chapterId);
    const target = resumeStillValid
      ? resume.chapterId
      : details.chapters[0]?.id;
    if (target) {
      navigate(mangaChapterLink(details.id, details.title, target), {
        replace: true,
      });
    } else {
      setError(t("manga.reader.noChapters"));
      setLoading(false);
    }
  }, [mangaId, details, chapterId, savedProgress, navigate, t]);

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

  const loadPages = useCallback(
    async (id: string, force = false) => {
      setLoading(true);
      setError(null);
      if (force) retried.current = false;
      try {
        const urls = await getChapterPages(id, {
          mangaId: details?.id,
          language: preferredLanguage,
          title: details?.title,
          alternateTitles: details?.alternateTitles,
          chapter: currentChapter?.chapter,
        });
        if (urls.length === 0) {
          setError(t("manga.reader.emptyChapter"));
          setPages([]);
          return;
        }
        setPages(urls);
        setPageIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load pages");
        setPages([]);
      } finally {
        setLoading(false);
      }
    },
    [t, details?.id, details?.title, details?.alternateTitles, currentChapter?.chapter, preferredLanguage],
  );

  useEffect(() => {
    if (!chapterId) return;
    if (!externalChapter && !details) return;
    retried.current = false;
    loadPages(chapterId);
  }, [chapterId, details, externalChapter, loadPages]);

  // Warm the next chapter so Next feels instant.
  useEffect(() => {
    if (!nextChapter?.id) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getChapterPages(nextChapter.id, {
        mangaId: details?.id,
        language: preferredLanguage,
        title: details?.title,
        alternateTitles: details?.alternateTitles,
        chapter: nextChapter.chapter,
      }).catch(() => {
        if (cancelled) return;
      });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextChapter?.id, nextChapter?.chapter, details?.id, details?.title, details?.alternateTitles, preferredLanguage]);

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
