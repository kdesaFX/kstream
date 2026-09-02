// I'm sorry this is so confusing 😭

import classNames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { mediaItemToId } from "@/backend/metadata/tmdb";
import { Button } from "@/components/buttons/Button";
import { Modal, ModalCard, useModal } from "@/components/overlays/Modal";
import { DotList } from "@/components/text/DotList";
import { MediaCardContextMenu } from "@/components/media/MediaCardContextMenu";
import { Flare } from "@/components/utils/Flare";
import { Heading2 } from "@/components/utils/Text";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useCardContentRating } from "@/hooks/useCardContentRating";
import { usePreferencesStore } from "@/stores/preferences";
import { lazyRootMarginFor } from "@/stores/preferences/deviceProfile";
import { resolveCardArtworkUrl } from "@/utils/media/artwork";
import { isMatureMedia } from "@/utils/media/mature";
import { MediaItem } from "@/utils/media/mediaTypes";
import { preloadPlayerView } from "@/setup/routePreload";

import { MediaBookmarkButton } from "./MediaBookmark";
import { dismissOpenContextMenu } from "@/components/utils/ContextMenu";
import { IconPatch } from "../buttons/IconPatch";
import { Icon, Icons } from "../Icon";
import { useOverlayStack } from "@/stores/interface/overlayStack";

/**
 * Observe once — stay loaded after first intersection. The node is held in
 * state rather than a ref so the observer lives in an effect: StrictMode's
 * dev-only setup→cleanup→setup pass re-runs effects but does not re-run ref
 * callbacks, which previously left every card observed by nothing and so
 * permanently without its poster.
 */
function useLazyVisible(eager = false) {
  const [isVisible, setIsVisible] = useState(eager);
  const [node, setNode] = useState<Element | null>(null);
  const posterQuality = usePreferencesStore((s) => s.posterQuality);
  const enableLowPerformanceMode = usePreferencesStore(
    (s) => s.enableLowPerformanceMode,
  );
  const rootMargin = lazyRootMarginFor(
    posterQuality ?? "standard",
    enableLowPerformanceMode,
  );

  useEffect(() => {
    if (!node || isVisible) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, isVisible, rootMargin]);

  return { targetRef: setNode, isVisible };
}

// Skeleton Component
export function MediaCardSkeleton() {
  const enableMinimalCards = usePreferencesStore((s) => s.enableMinimalCards);

  return (
    <Flare.Base className="group -m-[0.705em] rounded-xl bg-background-main transition-colors duration-300">
      <Flare.Light
        flareSize={300}
        cssColorVar="--colors-mediaCard-hoverAccent"
        backgroundClass="bg-mediaCard-hoverBackground duration-100"
        className="rounded-xl bg-background-main group-hover:opacity-100"
      />
      <Flare.Child className="pointer-events-auto relative mb-2 p-[0.4em] transition-transform duration-300 opacity-60">
        <div className="animate-pulse">
          {/* Poster skeleton - matches MediaCard poster dimensions exactly */}
          <div
            className={classNames(
              "relative pb-[150%] w-full overflow-hidden rounded-xl bg-mediaCard-hoverBackground",
              enableMinimalCards ? "" : "mb-4",
            )}
          />

          {!enableMinimalCards && (
            <>
              {/* Title skeleton - matches MediaCard title dimensions */}
              <div className="mb-1">
                <div className="h-4 bg-mediaCard-hoverBackground rounded w-full mb-1" />
                <div className="h-4 bg-mediaCard-hoverBackground rounded w-3/4 mb-1" />
                <div className="h-4 bg-mediaCard-hoverBackground rounded w-1/2" />
              </div>

              {/* Dot list skeleton - matches MediaCard dot list */}
              <div className="flex items-center gap-1">
                <div className="h-3 bg-mediaCard-hoverBackground rounded w-12" />
                <div className="h-1 w-1 bg-mediaCard-hoverBackground rounded-full" />
                <div className="h-3 bg-mediaCard-hoverBackground rounded w-8" />
              </div>
            </>
          )}
        </div>
      </Flare.Child>
    </Flare.Base>
  );
}

export interface MediaCardProps {
  media: MediaItem;
  linkable?: boolean;
  series?: {
    episode: number;
    season?: number;
    episodeId: string;
    seasonId: string;
  };
  percentage?: number;
  /** Corner label for media without seasons and episodes, e.g. a manga chapter. */
  badge?: string;
  closable?: boolean;
  onClose?: () => void;
  onShowDetails?: (media: MediaItem) => void;
  forceSkeleton?: boolean;
  editable?: boolean;
  onEdit?: (e?: React.MouseEvent) => void;
  /** Load the poster immediately instead of waiting for the lazy observer. */
  eager?: boolean;
}

function checkReleased(media: MediaItem): boolean {
  // MangaDex titles are always readable when listed — they may lack a year.
  if (media.type === "manga") return true;

  const isReleasedYear = Boolean(
    media.year && media.year <= new Date().getFullYear(),
  );
  const isReleasedDate = Boolean(
    media.release_date && media.release_date <= new Date(),
  );

  // If the media has a release date, use that, otherwise use the year
  const isReleased = media.release_date ? isReleasedDate : isReleasedYear;

  return isReleased;
}

function MediaCardContent({
  media,
  linkable,
  series,
  percentage,
  badge,
  closable,
  onClose,
  onShowDetails,
  forceSkeleton,
  editable,
  onEdit,
  eager,
}: MediaCardProps) {
  const { t } = useTranslation();
  const percentageString = `${Math.round(percentage ?? 0).toFixed(0)}%`;

  const isReleased = useCallback(() => checkReleased(media), [media]);

  const canLink = linkable && !closable && isReleased();

  const dotListContent = [t(`media.types.${media.type}`)];

  const [searchQuery] = useSearchQuery();
  const enableMinimalCards = usePreferencesStore((s) => s.enableMinimalCards);
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const enableLowPerformanceMode = usePreferencesStore(
    (s) => s.enableLowPerformanceMode,
  );
  const matureLocked = isMatureMedia(media) && !enableMatureTitles;
  const posterUrl = resolveCardArtworkUrl(media.poster);

  // Simple intersection observer for lazy loading images
  const { targetRef, isVisible: isIntersecting } = useLazyVisible(eager);
  const contentRating = useCardContentRating(media, isIntersecting);

  // Show skeleton if forced or if media hasn't loaded yet (empty title/poster)
  const shouldShowSkeleton = forceSkeleton || (!media.title && !media.poster);

  if (shouldShowSkeleton) {
    return (
      <div ref={targetRef}>
        <MediaCardSkeleton />
      </div>
    );
  }

  if (isReleased() && media.year) {
    dotListContent.push(media.year.toFixed());
  }

  if (!isReleased()) {
    dotListContent.push(t("media.unreleased"));
  }

  return (
    <div ref={targetRef}>
      <Flare.Base
        className={`group -m-[0.705em] rounded-xl bg-background-main transition-colors duration-300 focus:relative focus:z-10 ${
          canLink ? "hover:bg-mediaCard-hoverBackground tabbable" : ""
        } ${closable ? "jiggle" : ""}`}
        tabIndex={canLink ? 0 : -1}
        onKeyUp={(e) => e.key === "Enter" && e.currentTarget.click()}
      >
        <Flare.Light
          flareSize={300}
          cssColorVar="--colors-mediaCard-hoverAccent"
          backgroundClass="bg-mediaCard-hoverBackground duration-100"
          className={classNames({
            "rounded-xl bg-background-main group-hover:opacity-100": canLink,
          })}
        />
        <Flare.Child
          className={`pointer-events-auto relative mb-2 p-[0.4em] ${
            enableLowPerformanceMode
              ? ""
              : "transition-transform duration-300"
          } ${
            canLink && !enableLowPerformanceMode
              ? "group-hover:scale-95"
              : canLink
                ? ""
                : "opacity-60"
          }`}
        >
          <div
            className={classNames(
              "relative pb-[150%] w-full overflow-hidden rounded-xl bg-mediaCard-hoverBackground transition-[border-radius] duration-300",
              {
                "group-hover:rounded-lg": canLink,
              },
              enableMinimalCards ? "" : "mb-4",
            )}
          >
            {media.type === "manga" && posterUrl ? (
              // Manga posters may be AniList CDN (preferred) or proxied MangaDex.
              <img
                src={isIntersecting ? posterUrl : undefined}
                alt=""
                referrerPolicy="no-referrer"
                decoding="async"
                loading={eager ? "eager" : "lazy"}
                className="no-fade absolute inset-0 h-full w-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.opacity = "0";
                }}
                style={{
                  filter: matureLocked
                    ? "blur(14px) brightness(0.45)"
                    : undefined,
                  transform: matureLocked ? "scale(1.08)" : undefined,
                }}
              />
            ) : (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: isIntersecting
                    ? posterUrl
                      ? `url(${posterUrl})`
                      : "url(/placeholder.png)"
                    : "",
                  filter: matureLocked
                    ? "blur(14px) brightness(0.45)"
                    : undefined,
                  transform: matureLocked ? "scale(1.08)" : undefined,
                }}
              />
            )}
            {matureLocked ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/35">
                <span className="rounded-md bg-black/70 px-2.5 py-1 text-sm font-bold tracking-wide text-white">
                  {t("media.mature.badge")}
                </span>
              </div>
            ) : null}
            {contentRating || series || badge ? (
              <div className="absolute right-2 top-2 z-[1] flex flex-col items-end gap-1">
                {contentRating ? (
                  <div
                    className="rounded-md bg-mediaCard-badge px-2 py-1 transition-colors"
                    aria-label={t("media.contentRatingLabel", {
                      value: contentRating,
                    })}
                  >
                    <p className="text-center text-xs font-bold text-mediaCard-badgeText transition-colors">
                      {contentRating}
                    </p>
                  </div>
                ) : null}
                {series || badge ? (
                  <div className="rounded-md bg-mediaCard-badge px-2 py-1 transition-colors">
                    <p
                      className={[
                        "text-center text-xs font-bold text-mediaCard-badgeText transition-colors",
                        closable ? "" : "group-hover:text-white",
                      ].join(" ")}
                    >
                      {series
                        ? t("media.episodeDisplay", {
                            season: series.season || 1,
                            episode: series.episode,
                          })
                        : badge}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {percentage !== undefined ? (
              <>
                <div
                  className={`absolute inset-x-0 -bottom-px pb-1 h-12 bg-gradient-to-t from-mediaCard-shadow to-transparent transition-colors ${
                    canLink ? "group-hover:from-mediaCard-hoverShadow" : ""
                  }`}
                />
                <div
                  className={`absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-mediaCard-shadow to-transparent transition-colors ${
                    canLink ? "group-hover:from-mediaCard-hoverShadow" : ""
                  }`}
                />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="relative h-1 overflow-hidden rounded-full bg-mediaCard-barColor">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-mediaCard-barFillColor"
                      style={{
                        width: percentageString,
                      }}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {!closable && media.type !== "manga" && (
              <div
                className="absolute bookmark-button"
                onClick={(e) => e.preventDefault()}
              >
                <MediaBookmarkButton media={media} />
              </div>
            )}

            {searchQuery.length > 0 && !closable && media.type !== "manga" ? (
              <div className="absolute" onClick={(e) => e.preventDefault()}>
                <MediaBookmarkButton media={media} />
              </div>
            ) : null}

            <div
              className={`absolute inset-0 flex items-center justify-center bg-mediaCard-badge bg-opacity-80 transition-opacity duration-500 ${
                closable ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <IconPatch
                clickable
                className="text-2xl text-mediaCard-badgeText transition-transform hover:scale-110 duration-500"
                onClick={() => closable && onClose?.()}
                icon={Icons.X}
              />
            </div>
          </div>

          {!enableMinimalCards && (
            <>
              <h1 className="mb-1 line-clamp-3 max-h-[4.5rem] text-ellipsis break-words font-bold text-white">
                <span>{media.title}</span>
              </h1>
              <div className="media-info-container justify-content-center flex flex-wrap">
                <DotList className="text-xs" content={dotListContent} />
              </div>

              {!closable && (
                <div className="absolute bottom-0 translate-y-1 right-1">
                  <button
                    className="media-more-button p-2"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onShowDetails?.(media);
                    }}
                  >
                    <Icon
                      className="text-xs font-semibold text-type-secondary"
                      icon={Icons.ELLIPSIS}
                    />
                  </button>
                </div>
              )}
              {editable && closable && (
                <div className="absolute bottom-0 translate-y-1 right-1">
                  <button
                    className="media-more-button p-2"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit?.(e);
                    }}
                  >
                    <Icon
                      className="text-xs font-semibold text-type-secondary"
                      icon={Icons.EDIT}
                    />
                  </button>
                </div>
              )}
            </>
          )}
        </Flare.Child>
      </Flare.Base>
    </div>
  );
}

export function MediaCard(props: MediaCardProps) {
  const { media, onShowDetails, forceSkeleton } = props;
  const { showModal } = useOverlayStack();
  const { t } = useTranslation();
  const enableDetailsModal = usePreferencesStore(
    (state) => state.enableDetailsModal,
  );
  const enableMatureTitles = usePreferencesStore((s) => s.enableMatureTitles);
  const setEnableMatureTitles = usePreferencesStore(
    (s) => s.setEnableMatureTitles,
  );
  const matureLocked = isMatureMedia(media) && !enableMatureTitles;
  const matureGateModal = useModal(`mature-gate-${media.id}`);
  const navigate = useNavigate();

  const isReleased = useCallback(
    () => checkReleased(props.media),
    [props.media],
  );

  const canLink = Boolean(
    props.linkable && !props.closable && isReleased(),
  );

  let link = "#";
  if (canLink) {
    link =
      media.type === "manga"
        ? `/manga/${encodeURIComponent(mediaItemToId(media))}`
        : `/media/${encodeURIComponent(mediaItemToId(media))}`;
  }
  if (canLink && props.series && media.type !== "manga") {
    if (props.series.season === 0 && !props.series.episodeId) {
      link += `/${encodeURIComponent(props.series.seasonId)}`;
    } else {
      link += `/${encodeURIComponent(
        props.series.seasonId,
      )}/${encodeURIComponent(props.series.episodeId)}`;
    }
  }

  const showDetails = useCallback(async () => {
    if (onShowDetails) {
      onShowDetails(media);
      return;
    }

    if (media.type === "manga") {
      showModal("manga-details", {
        id: media.id as unknown as number,
        mangaId: media.id,
        type: "manga",
      });
      return;
    }

    // Show modal with data through overlayStack
    showModal("details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  }, [media, showModal, onShowDetails]);

  const handleShowDetails = useCallback(async () => {
    if (matureLocked) {
      matureGateModal.show();
      return;
    }
    await showDetails();
  }, [showDetails, matureLocked, matureGateModal]);

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Unreleased titles aren't linkable but still wear the 18+ cover, so they
  // still owe the viewer an explanation when tapped. Delete mode is the one
  // exception: there the click belongs to the X sitting over the poster.
  const gateClicks = matureLocked && !props.closable;

  // Turning the preference on from here, rather than handing the viewer off to
  // Settings, keeps the click they already made alive: they wanted this title,
  // so open it. The old route lost their place in the page and made them find
  // the poster a second time.
  const allowMatureAndContinue = () => {
    setEnableMatureTitles(true);
    matureGateModal.hide();
    if (!canLink) return;
    if (enableDetailsModal) {
      showDetails();
      return;
    }
    navigate(link);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (gateClicks) {
      e.preventDefault();
      matureGateModal.show();
      return;
    }
    if (enableDetailsModal && canLink) {
      e.preventDefault();
      handleShowDetails();
    }
  };

  const handleCardContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismissOpenContextMenu();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleEditClick = (e?: React.MouseEvent) => {
    if (e) handleCardContextMenu(e);
  };

  const content = (
    <MediaCardContent
      {...props}
      onEdit={props.onEdit ? handleEditClick : undefined}
      onShowDetails={handleShowDetails}
      forceSkeleton={forceSkeleton}
    />
  );

  const contextMenuEl = contextMenuPos ? (
    <MediaCardContextMenu
      media={media}
      x={contextMenuPos.x}
      y={contextMenuPos.y}
      link={link}
      canLink={canLink}
      percentage={props.percentage}
      series={props.series}
      onClose={() => setContextMenuPos(null)}
      onShowDetails={handleShowDetails}
      onEdit={
        props.onEdit
          ? () => {
              props.onEdit?.();
            }
          : undefined
      }
    />
  ) : null;

  // Only the covered titles need the dialog, and there can be hundreds of cards
  // on a page — each one carries a portal, so don't mount what can't open.
  const matureGateEl = matureLocked ? (
    <Modal id={matureGateModal.id}>
      <ModalCard>
        <Heading2 className="!mt-0 !mb-4">{t("media.mature.title")}</Heading2>
        <p className="mb-6 text-type-text">{t("media.mature.description")}</p>
        <div className="flex justify-end gap-3">
          <Button theme="secondary" onClick={() => matureGateModal.hide()}>
            {t("actions.cancel")}
          </Button>
          <Button theme="purple" onClick={allowMatureAndContinue}>
            {t("media.mature.openSettings")}
          </Button>
        </div>
      </ModalCard>
    </Modal>
  ) : null;

  if (!canLink) {
    return (
      <>
        <span
          className="relative block"
          onClick={handleCardClick}
          onContextMenu={handleCardContextMenu}
        >
          {content}
          {contextMenuEl}
        </span>
        {matureGateEl}
      </>
    );
  }

  return (
    <>
      <Link
        to={link}
        tabIndex={-1}
        className={classNames(
          "tabbable relative block",
          props.closable ? "hover:cursor-default" : "",
        )}
        onMouseEnter={() => {
          if (link.startsWith("/media/")) preloadPlayerView();
        }}
        onFocus={() => {
          if (link.startsWith("/media/")) preloadPlayerView();
        }}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
      >
        {content}
        {contextMenuEl}
      </Link>
      {matureGateEl}
    </>
  );
}
