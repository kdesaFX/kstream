import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useCopyToClipboard } from "react-use";

import { getMangaDetails } from "@/backend/manga/catalog";
import { mangaMediaLink, mangaChapterLink } from "@/backend/manga/ids";
import {
  resolveMangaAnimeAdaptation,
  type MangaAnimeAdaptation,
} from "@/backend/manga/mangaLogo";
import { chapterLabel } from "@/backend/manga/mangadex";
import type { MangaChapter, MangaDetails } from "@/backend/manga/types";
import { preloadMangaReaderView } from "@/setup/routePreload";
import { mangaStatusKey } from "@/backend/manga/types";
import { Button } from "@/components/buttons/Button";
import { IconPatch } from "@/components/buttons/IconPatch";
import { Icon, Icons } from "@/components/Icon";
import { MediaCard, MediaCardSkeleton } from "@/components/media/MediaCard";
import { OverlayPortal } from "@/components/overlays/OverlayDisplay";
import { Flare } from "@/components/utils/Flare";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CarouselNavButtons } from "@/pages/discover/components/CarouselNavButtons";
import { useMangaRecommendations } from "@/pages/discover/hooks/useMangaRecommendations";
import { HomeAd } from "@/pages/parts/home/HomeAd";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { mangaProgressHasMeaningfulRead } from "@/stores/mangaProgress/utils";
import { usePreferencesStore } from "@/stores/preferences";
import { resolveCardArtworkUrl } from "@/utils/media/artwork";
import type { MediaItem } from "@/utils/media/mediaTypes";

function MangaDetailsSkeleton() {
  return (
    <div className="relative h-full flex flex-col animate-pulse">
      <div className="relative -mt-12 z-20" style={{ height: "500px" }}>
        <div className="absolute inset-x-0 bottom-20 z-30 px-6">
          <div className="h-12 w-64 bg-white/10 rounded-lg" />
        </div>
        <div
          className="absolute inset-0 bg-white/10"
          style={{
            maskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 120px)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 120px)",
            zIndex: -1,
          }}
        />
      </div>
      <div className="px-6 pb-6 mt-[-70px] flex-grow relative z-30">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="h-12 w-40 bg-white/10 rounded-lg" />
          <div className="h-10 w-10 bg-white/10 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 md:gap-6 pt-4">
          <div className="md:col-span-2 space-y-4">
            <div className="h-4 bg-white/10 rounded w-full" />
            <div className="h-4 bg-white/10 rounded w-full" />
            <div className="h-4 bg-white/10 rounded w-3/4" />
            <div className="flex gap-2 pt-2">
              <div className="h-6 w-20 bg-white/10 rounded-full" />
              <div className="h-6 w-24 bg-white/10 rounded-full" />
              <div className="h-6 w-16 bg-white/10 rounded-full" />
            </div>
          </div>
          <div className="md:col-span-1">
            <div className="bg-background-secondary/50 p-4 rounded-lg space-y-3">
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-4 w-36 bg-white/10 rounded" />
              <div className="h-4 w-20 bg-white/10 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChapterListButton({
  chapter,
  active,
  onOpen,
}: {
  chapter: MangaChapter;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={classNames(
        "w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-background-secondary transition-colors",
        active && "bg-background-secondary text-type-link",
      )}
      onClick={onOpen}
    >
      {chapterLabel(chapter)}
    </button>
  );
}

export function MangaDetailsModal({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hideModal, isModalVisible, modalStack, getModalData, showModal } =
    useOverlayStack();
  const preferredLanguage = usePreferencesStore(
    (s) => s.mangaPreferredLanguage,
  );
  const enableImageLogos = usePreferencesStore((s) => s.enableImageLogos);
  const progress = useMangaProgressStore((s) => s.items);
  const { isMobile } = useIsMobile();
  const [, copyToClipboard] = useCopyToClipboard();
  const [hasCopiedShare, setHasCopiedShare] = useState(false);
  const [logoHeight, setLogoHeight] = useState(0);
  const logoRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const similarCarouselRef = useRef<HTMLDivElement>(null);
  const similarCarouselRefs = useRef<{
    [key: string]: HTMLDivElement | null;
  }>({ similar: null });

  const [loaded, setLoaded] = useState<{
    mangaId: string;
    details: MangaDetails;
  } | null>(null);
  const [failed, setFailed] = useState<{
    mangaId: string;
    message: string;
  } | null>(null);
  const [adaptation, setAdaptation] = useState<MangaAnimeAdaptation | null>(
    null,
  );
  /** True while WeebCentral/Comick fill licensed MangaDex gaps. */
  const [chaptersPending, setChaptersPending] = useState(false);

  const modalIndex = modalStack.indexOf(id);
  const zIndex = modalIndex >= 0 ? 1000 + modalIndex : 999;
  const hide = useCallback(() => hideModal(id), [hideModal, id]);
  const isShown = isModalVisible(id);
  const modalData = getModalData(id);
  const mangaId = String(modalData?.mangaId ?? modalData?.id ?? "");
  const shouldShow = Boolean(isShown && mangaId);

  // One instance of this modal serves every title, so what it holds has to be
  // stamped with the manga it belongs to. Reading it back by id means opening
  // Vagabond can't show the Berserk it happens to still be holding.
  const details = loaded?.mangaId === mangaId ? loaded.details : null;
  const error = failed?.mangaId === mangaId ? failed.message : null;
  const isLoading = !details && !error;

  useEffect(() => {
    if (!shouldShow || !mangaId) return undefined;
    preloadMangaReaderView();
    let cancelled = false;
    let receivedPartial = false;
    setFailed(null);
    setChaptersPending(true);
    // Negative hero margin used to clip the title above scrollTop=0 — reset.
    scrollBodyRef.current?.scrollTo({ top: 0 });
    getMangaDetails(mangaId, preferredLanguage, (partial) => {
      if (cancelled) return;
      receivedPartial = true;
      setLoaded({ mangaId, details: partial });
      // MD returned first — keep the chapters section in a loading state when
      // empty OR suspiciously thin so licensed stubs don't flash as "done".
      setChaptersPending(
        partial.chapters.length === 0 || partial.chapters.length <= 8,
      );
    })
      .then((d) => {
        if (cancelled) return;
        setLoaded({ mangaId, details: d });
        setChaptersPending(false);
        setFailed(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setChaptersPending(false);
        if (!receivedPartial) {
          setFailed({
            mangaId,
            message: e instanceof Error ? e.message : "Failed to load",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shouldShow, mangaId, preferredLanguage]);

  useEffect(() => {
    if (!details?.title) {
      setAdaptation(null);
      return undefined;
    }
    let cancelled = false;
    resolveMangaAnimeAdaptation(details.title)
      .then((resolved) => {
        if (!cancelled) setAdaptation(resolved);
      })
      .catch(() => {
        if (!cancelled) setAdaptation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [details?.title]);

  useEffect(() => {
    if (!logoRef.current) return undefined;
    const el = logoRef.current;
    const update = () => setLogoHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [details?.title, adaptation?.logoUrl, enableImageLogos]);

  useEffect(() => {
    if (similarCarouselRef.current) {
      similarCarouselRefs.current.similar = similarCarouselRef.current;
    }
  }, [details?.id]);

  const {
    media: similarMedia,
    isLoading: similarLoading,
  } = useMangaRecommendations(
    details?.id,
    details?.title,
    details?.tags,
    Boolean(shouldShow && details),
  );

  const resume = progress[mangaId];
  const statusKey = details ? mangaStatusKey(details.status) : null;
  const logoUrl = adaptation?.logoUrl;
  const heroBackdrop = resolveCardArtworkUrl(
    adaptation?.backdropUrl ?? details?.poster,
  );

  const startChapterId = useMemo(() => {
    if (resume && mangaProgressHasMeaningfulRead(resume)) return resume.chapterId;
    return details?.chapters[0]?.id;
  }, [resume, details]);

  const readProgress = useMemo(() => {
    if (!details?.chapters.length) {
      return { read: 0, total: 0, percentage: 0 };
    }
    const total = details.chapters.length;
    if (!resume || !mangaProgressHasMeaningfulRead(resume)) {
      return { read: 0, total, percentage: 0 };
    }
    const idx = details.chapters.findIndex((ch) => ch.id === resume.chapterId);
    const read = idx >= 0 ? idx + 1 : 0;
    return {
      read,
      total,
      percentage: total > 0 ? Math.round((read / total) * 100) : 0,
    };
  }, [details, resume]);

  const useVolumeGroups = Boolean(
    details?.chapterGroups &&
      details.chapterGroups.length > 0 &&
      details.chapterGroups.some((g) => g.volume && g.volume !== "none"),
  );

  const openReader = (chapterId?: string) => {
    if (!details) return;
    const target = chapterId ?? startChapterId;
    hide();
    if (target) {
      navigate(mangaChapterLink(details.id, details.title, target));
      return;
    }
    // Chapters still resolving — reader waits for merge then picks first/resume.
    navigate(mangaMediaLink(details.id, details.title));
  };

  const readDisabled =
    Boolean(details) &&
    !chaptersPending &&
    !startChapterId &&
    (details?.chapters.length ?? 0) === 0;

  const handleShareClick = () => {
    if (!details) return;
    const shareUrl = `${window.location.origin}${mangaMediaLink(
      details.id,
      details.title,
    )}`;
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent) && navigator.share) {
      navigator
        .share({
          title: "kstream",
          text: details.title,
          url: shareUrl,
        })
        .catch(() => {
          /* user cancelled */
        });
    } else {
      copyToClipboard(shareUrl);
      setHasCopiedShare(true);
      setTimeout(() => setHasCopiedShare(false), 2000);
    }
  };

  const handleSimilarClick = useCallback(
    (media: MediaItem) => {
      showModal("manga-details", {
        id: media.id as unknown as number,
        mangaId: media.id,
        type: "manga",
      });
    },
    [showModal],
  );

  if (!shouldShow) return null;

  return (
    <OverlayPortal
      darken
      close={hide}
      show={shouldShow}
      durationClass="duration-500"
      zIndex={zIndex}
    >
      <Helmet>
        <html data-no-scroll />
        <title>
          {details?.title
            ? `${details.title} - ${t("global.name")}`
            : t("global.name")}
        </title>
      </Helmet>
      <div
        className="flex absolute inset-0 items-center justify-center pt-safe"
        style={{ zIndex }}
      >
        <Flare.Base
          className={classNames(
            "group -m-[0.705em] rounded-3xl bg-background-main",
            "max-h-[900px] max-w-[1200px]",
            "bg-mediaCard-hoverBackground/60 backdrop-filter backdrop-blur-lg shadow-lg overflow-hidden",
            "h-[97%] w-[95%]",
            "relative pointer-events-auto",
          )}
        >
          <div
            className="transition-transform duration-300 h-full relative"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <Flare.Light
              flareSize={300}
              cssColorVar="--colors-mediaCard-hoverAccent"
              backgroundClass="bg-modal-background duration-100"
              className="rounded-3xl bg-background-main group-hover:opacity-100 transition-opacity duration-300"
            />
            <div className="absolute right-4 top-4 z-50 pointer-events-auto">
              <button
                type="button"
                className="text-s font-semibold text-type-secondary hover:text-white transition-transform hover:scale-95 select-none"
                onClick={hide}
              >
                <IconPatch icon={Icons.X} />
              </button>
            </div>
            <Flare.Child className="pointer-events-auto relative h-full">
              <div
                ref={scrollBodyRef}
                className="h-full overflow-y-auto scrollbar-none select-text pt-12"
              >
              {hasCopiedShare ? (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg transition-all duration-300 animate-[scaleIn_0.6s_ease-out_forwards]">
                  <div className="flex items-center gap-2">
                    <Icon icon={Icons.CHECKMARK} className="text-white" />
                    <span className="text-sm font-medium">
                      Link copied to clipboard!
                    </span>
                  </div>
                </div>
              ) : null}

              {isLoading ? <MangaDetailsSkeleton /> : null}
              {error && !details ? (
                <div className="p-10 text-center text-red-400">{error}</div>
              ) : null}
              {details ? (
                <div className="relative min-h-full flex flex-col">
                  {/* Tall hero backdrop — -mt-12 bleeds into pt-12 so the title stays reachable */}
                  <div
                    className="relative -mt-12 z-20"
                    style={{
                      height: `${Math.max(500, logoHeight + 400)}px`,
                    }}
                  >
                    <div
                      ref={logoRef}
                      className="absolute inset-x-0 bottom-20 z-30 px-6"
                    >
                      {logoUrl && enableImageLogos ? (
                        <img
                          src={logoUrl}
                          alt={details.title}
                          className="max-w-[16rem] md:max-w-[20rem] lg:max-w-[30rem] max-h-[12rem] object-contain drop-shadow-lg bg-transparent"
                          style={{ background: "none" }}
                        />
                      ) : (
                        <h3 className="text-3xl md:text-4xl font-bold text-white drop-shadow-lg">
                          {details.title}
                        </h3>
                      )}
                    </div>
                    <div
                      className="absolute inset-0 bg-top before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.4)_100%)]"
                      style={{
                        backgroundPosition: "center top",
                        maskImage:
                          "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 150px)",
                        WebkitMaskImage:
                          "linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 150px)",
                        zIndex: -1,
                      }}
                    >
                      {heroBackdrop ? (
                        <img
                          src={heroBackdrop}
                          alt=""
                          decoding="async"
                          // eslint-disable-next-line react/no-unknown-property -- LCP hint
                          fetchPriority="high"
                          className="absolute inset-0 h-full w-full object-cover object-top no-fade"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="px-6 pb-6 mt-[-70px] flex-grow relative z-30">
                    {/* CTA row */}
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
                        {details.rating != null ? (
                          <span>★ {details.rating.toFixed(1)}</span>
                        ) : null}
                        {details.year ? (
                          <>
                            {details.rating != null ? (
                              <span className="text-white/60">•</span>
                            ) : null}
                            <span>{details.year}</span>
                          </>
                        ) : null}
                        {statusKey ? (
                          <>
                            {(details.rating != null || details.year) && (
                              <span className="text-white/60">•</span>
                            )}
                            <span>{t(statusKey)}</span>
                          </>
                        ) : null}
                        {details.chapters.length > 0 ? (
                          <>
                            <span className="text-white/60">•</span>
                            <span>
                              {details.chapters.length}{" "}
                              {t("manga.details.chapters")}
                            </span>
                          </>
                        ) : null}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <Button
                            onClick={() => openReader()}
                            theme="purple"
                            disabled={readDisabled}
                            className={classNames(
                              "flex-1 sm:flex-initial sm:w-auto",
                              "gap-2 h-12 rounded-lg px-4 py-2 my-1 transition-transform hover:scale-105 duration-100",
                              "text-md text-white flex items-center justify-center",
                            )}
                          >
                            <Icon icon={Icons.BOOK} className="text-white" />
                            <span className="text-white text-sm pr-1">
                              {chaptersPending && !startChapterId
                                ? t("manga.details.loadingChapters")
                                : resume &&
                                    mangaProgressHasMeaningfulRead(resume)
                                  ? t("manga.details.continue")
                                  : t("manga.details.read")}
                            </span>
                          </Button>
                          <button
                            type="button"
                            onClick={handleShareClick}
                            className="p-2 opacity-75 transition-opacity duration-300 hover:scale-110 hover:cursor-pointer hover:opacity-95"
                            title="Share"
                          >
                            <IconPatch
                              icon={Icons.IOS_SHARE}
                              className="transition-transform duration-300 hover:scale-110 hover:cursor-pointer"
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Two-column overview + metadata */}
                    <div className="grid grid-cols-1 md:grid-cols-3 md:gap-6 pt-4">
                      <div className="md:col-span-2">
                        {details.description ? (
                          <p className="text-sm text-white/90 mb-6">
                            {details.description}
                          </p>
                        ) : (
                          <p className="text-sm text-white/60 italic mb-6">
                            {t("manga.details.noDescription")}
                          </p>
                        )}

                        {details.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-2 items-center mb-6">
                            {details.tags.slice(0, 16).map((tag, index) => (
                              <span
                                key={tag.id}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white/80 transition-all duration-300 hover:scale-110 animate-[scaleIn_0.6s_ease-out_forwards]"
                                style={{
                                  animationDelay: `${(Math.min(details.tags.length, 16) - 1 - index) * 60}ms`,
                                  transform: "scale(0)",
                                  opacity: 0,
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="space-y-4 mb-6">
                          {details.authors.length > 0 ? (
                            <div className="text-xs">
                              <span className="font-medium text-white/80">
                                {t("manga.details.authors")}
                              </span>{" "}
                              <span className="text-white/70">
                                {details.authors.join(", ")}
                              </span>
                            </div>
                          ) : null}
                          {details.artists.length > 0 ? (
                            <div className="text-xs">
                              <span className="font-medium text-white/80">
                                {t("manga.details.artists")}
                              </span>{" "}
                              <span className="text-white/70">
                                {details.artists.join(", ")}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="md:col-span-1">
                        <div className="bg-background-secondary/50 group-hover:bg-background-secondary/80 p-4 rounded-lg border-buttons-primary transition-colors duration-300">
                          <div className="space-y-3 text-xs">
                            {statusKey ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("manga.details.status")}
                                </span>{" "}
                                {t(statusKey)}
                              </div>
                            ) : null}
                            {details.year ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("manga.details.year")}
                                </span>{" "}
                                {details.year}
                              </div>
                            ) : null}
                            {details.rating != null ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("manga.details.score")}
                                </span>{" "}
                                ★ {details.rating.toFixed(1)}
                              </div>
                            ) : null}
                            {details.follows != null ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("manga.details.follows")}
                                </span>{" "}
                                {details.follows.toLocaleString()}
                              </div>
                            ) : null}
                            {details.originalLanguage ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("details.language")}
                                </span>{" "}
                                {details.originalLanguage.toUpperCase()}
                              </div>
                            ) : null}
                            {details.contentRating ? (
                              <div className="flex items-center gap-1 text-white/80">
                                <span className="font-medium">
                                  {t("manga.details.contentRating")}
                                </span>{" "}
                                {details.contentRating.charAt(0).toUpperCase() +
                                  details.contentRating.slice(1)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <HomeAd slot="mangaMid" />

                    {/* Chapters */}
                    <div className="space-y-3 pt-8">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-lg font-semibold text-white/90">
                          {t("manga.details.chapters")}
                        </h3>
                        {readProgress.total > 0 ? (
                          <span className="text-xs md:text-sm text-white/70">
                            {t("manga.details.readProgress", {
                              read: readProgress.read,
                              total: readProgress.total,
                              percentage: readProgress.percentage,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="max-h-[28rem] space-y-1 overflow-y-auto overscroll-contain pr-1 rounded-xl"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {details.chapters.length === 0 ||
                        (chaptersPending && details.chapters.length <= 8) ? (
                          <p className="text-sm text-type-secondary">
                            {chaptersPending
                              ? t("manga.details.loadingChapters")
                              : t("manga.details.noChapters")}
                          </p>
                        ) : useVolumeGroups ? (
                          details.chapterGroups.map((group) => (
                            <div key={group.volume} className="space-y-1 mb-3">
                              <h4 className="sticky top-0 z-10 bg-background-main/95 backdrop-blur-sm text-xs font-semibold uppercase tracking-wide text-white/50 px-3 py-2">
                                {group.volume === "none"
                                  ? t("manga.details.noVolume")
                                  : t("manga.details.volume", {
                                      volume: group.volume,
                                    })}
                              </h4>
                              {group.chapters.map((ch) => (
                                <ChapterListButton
                                  key={ch.id}
                                  chapter={ch}
                                  active={resume?.chapterId === ch.id}
                                  onOpen={() => openReader(ch.id)}
                                />
                              ))}
                            </div>
                          ))
                        ) : (
                          details.chapters.map((ch) => (
                            <ChapterListButton
                              key={ch.id}
                              chapter={ch}
                              active={resume?.chapterId === ch.id}
                              onOpen={() => openReader(ch.id)}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Similar Manga + details MREC */}
                    {(similarLoading || similarMedia.length > 0) && (
                      <div className="flex flex-col lg:flex-row gap-4 items-start pt-8">
                        <div className="min-w-0 flex-1 w-full space-y-4">
                          <h3 className="text-lg font-semibold text-white/90">
                            {t("manga.details.similar")}
                          </h3>
                          <div className="relative">
                            <div
                              ref={similarCarouselRef}
                              className="grid grid-flow-col auto-cols-max gap-4 pt-0 overflow-x-scroll scrollbar-none rounded-xl overflow-y-hidden md:pl-8 md:pr-8"
                              style={{
                                scrollSnapType: "x mandatory",
                                scrollBehavior: "smooth",
                              }}
                            >
                              <div className="md:w-12" />
                              {similarLoading
                                ? Array.from({ length: 8 }, (_, i) => (
                                    <div
                                      key={`manga-similar-skel-${i}`}
                                      className="relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"
                                      style={{ scrollSnapAlign: "start" }}
                                    >
                                      <MediaCardSkeleton />
                                    </div>
                                  ))
                                : similarMedia.map((media) => (
                                    <div
                                      key={media.id}
                                      className="relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"
                                      style={{ scrollSnapAlign: "start" }}
                                    >
                                      <MediaCard
                                        media={media}
                                        linkable
                                        onShowDetails={handleSimilarClick}
                                      />
                                    </div>
                                  ))}
                              <div className="md:w-12" />
                            </div>
                            {!isMobile ? (
                              <CarouselNavButtons
                                categorySlug="similar"
                                carouselRefs={similarCarouselRefs}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="w-full lg:w-auto flex justify-center lg:justify-end lg:pt-10 lg:sticky lg:top-4">
                          <HomeAd slot="details" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              </div>
            </Flare.Child>
          </div>
        </Flare.Base>
      </div>
    </OverlayPortal>
  );
}
