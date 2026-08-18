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
import {
  chapterLabel,
  chapterPageUrls,
  getChapterAtHome,
} from "@/backend/manga/mangadex";
import type { MangaChapter, MangaDetails } from "@/backend/manga/types";
import { Icon, Icons } from "@/components/Icon";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { usePreferencesStore } from "@/stores/preferences";

function PageImage({
  src,
  alt,
  referrerPolicy,
  onError,
}: {
  src: string;
  alt: string;
  referrerPolicy: "origin" | "no-referrer";
  onError: () => void;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className="max-w-full h-auto mx-auto block bg-black/40"
      loading="lazy"
      decoding="async"
      // MangaDex image nodes drop requests that carry no referrer at all, so
      // send the bare origin. WeebCentral's CDN is the opposite: a foreign
      // referrer can get you a placeholder, so those pages go out with none.
      referrerPolicy={referrerPolicy}
      onError={onError}
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

  const chapterId = chapterParam ? decodeURIComponent(chapterParam) : undefined;
  const pageReferrer =
    chapterId && isWeebCentralId(chapterId) ? "no-referrer" : "origin";

  // Same route serves every manga, so details are only usable for the one
  // currently in the URL — otherwise the chapter list and resume redirect below
  // would come from whichever manga was open before.
  const details =
    loadedDetails && loadedDetails.mangaId === mangaId
      ? loadedDetails.details
      : null;

  const chapters = details?.chapters ?? [];
  const chapterIndex = chapters.findIndex((c) => c.id === chapterId);
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

  // Load manga details
  useEffect(() => {
    if (!mangaId) return undefined;
    let cancelled = false;
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

  // Redirect /manga/:id → first or resume chapter
  useEffect(() => {
    if (!mangaId || !details || chapterId) return;
    const resume = savedProgress[mangaId];
    const target = resume?.chapterId || details.chapters[0]?.id;
    if (target) {
      navigate(mangaChapterLink(details.id, details.title, target), {
        replace: true,
      });
    } else {
      setError(t("manga.reader.noChapters"));
      setLoading(false);
    }
  }, [mangaId, details, chapterId, savedProgress, navigate, t]);

  const loadPages = useCallback(
    async (id: string, force = false) => {
      setLoading(true);
      setError(null);
      if (force) retried.current = false;
      try {
        const urls = await getChapterPages(id);
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
    [t],
  );

  useEffect(() => {
    if (!chapterId) return;
    retried.current = false;
    loadPages(chapterId);
  }, [chapterId, loadPages]);

  // Warm the next chapter so Next feels instant.
  useEffect(() => {
    if (!nextChapter?.id) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getChapterPages(nextChapter.id).catch(() => {
        if (cancelled) return;
      });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nextChapter?.id]);

  // Resume page within chapter
  useEffect(() => {
    if (!mangaId || !chapterId || pages.length === 0) return;
    const resume = savedProgress[mangaId];
    if (resume?.chapterId === chapterId && resume.page > 0) {
      setPageIndex(Math.min(resume.page, pages.length - 1));
    }
  }, [mangaId, chapterId, pages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist progress
  useEffect(() => {
    if (!details || !chapterId || !currentChapter || pages.length === 0) return;
    updateProgress({
      mangaId: details.id,
      title: details.title,
      poster: details.poster,
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
    if (isWeebCentralId(chapterId)) return;
    retried.current = true;
    try {
      const atHome = await getChapterAtHome(chapterId);
      const urls = chapterPageUrls(atHome, "data-saver");
      if (urls[index]) {
        setPages((prev) => {
          const copy = [...prev];
          copy[index] = urls[index];
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
        <html data-no-scroll={readerMode === "paged" ? "true" : undefined} />
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
            <div className="truncate text-xs text-white/60">
              {currentChapter ? chapterLabel(currentChapter) : "…"}
            </div>
          </div>
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
          className={classNames(
            "pt-14 pb-20",
            readerMode === "paged" &&
              "flex items-center justify-center min-h-screen",
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
          style={
            readerMode === "vertical"
              ? { overflowY: "auto", maxHeight: "100vh" }
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
                  onError={() => onPageError(i)}
                />
              ))}
            </div>
          ) : (
            <div className="w-full max-w-4xl px-2">
              <PageImage
                src={pages[pageIndex]}
                alt={`Page ${pageIndex + 1}`}
                referrerPolicy={pageReferrer}
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
