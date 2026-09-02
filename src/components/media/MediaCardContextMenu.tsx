import classNames from "classnames";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useCopyToClipboard } from "react-use";

import { Icon, Icons } from "@/components/Icon";
import {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuHeader,
  ContextMenuItem,
  ContextMenuSectionLabel,
} from "@/components/utils/ContextMenu";
import { useBookmarkStore } from "@/stores/bookmarks";
import { PlayerMeta } from "@/stores/player/slices/source";
import { useProgressStore } from "@/stores/progress";
import {
  createGroupString,
  parseGroupString,
} from "@/utils/media/bookmarkModifications";
import { MediaItem } from "@/utils/media/mediaTypes";

const EMPTY_GROUPS: string[] = [];

function tmdbPageUrl(media: MediaItem): string | null {
  if (media.type === "manga") return null;
  const segment = media.type === "show" ? "tv" : "movie";
  return `https://www.themoviedb.org/${segment}/${media.id}`;
}

export interface MediaCardContextMenuProps {
  media: MediaItem;
  x: number;
  y: number;
  onClose: () => void;
  link: string;
  canLink: boolean;
  percentage?: number;
  onShowDetails: () => void;
  onEdit?: () => void;
}

export function MediaCardContextMenu({
  media,
  x,
  y,
  onClose,
  link,
  canLink,
  percentage,
  onShowDetails,
  onEdit,
}: MediaCardContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, copyToClipboard] = useCopyToClipboard();

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const modifyBookmarks = useBookmarkStore((s) => s.modifyBookmarks);
  const addBookmarkWithGroups = useBookmarkStore((s) => s.addBookmarkWithGroups);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const isBookmarked = useBookmarkStore((s) => !!s.bookmarks[media.id]);
  const currentGroups = useBookmarkStore(
    (s) => s.bookmarks[media.id]?.group ?? EMPTY_GROUPS,
  );
  const bookmarksForMenu = useBookmarkStore((s) => s.bookmarks);
  const removeFromWatching = useProgressStore((s) => s.removeItem);
  const hasWatchingProgress = useProgressStore((s) => Boolean(s.items[media.id]));

  const allGroups = useMemo(() => {
    const groupSet = new Set<string>();
    Object.values(bookmarksForMenu).forEach((bookmark) => {
      bookmark.group?.forEach((group) => groupSet.add(group));
    });
    return Array.from(groupSet);
  }, [bookmarksForMenu]);

  const meta: PlayerMeta | undefined = useMemo(() => {
    if (media.type === "manga" || media.year === undefined) return undefined;
    return {
      type: media.type,
      title: media.title,
      tmdbId: media.id,
      releaseYear: media.year,
      poster: media.poster,
    };
  }, [media]);

  const showResume =
    canLink && (percentage !== undefined ? percentage > 0 : hasWatchingProgress);
  const tmdbUrl = tmdbPageUrl(media);
  const absoluteLink =
    typeof window !== "undefined" ? new URL(link, window.location.origin).href : link;

  const closeAnd = (fn: () => void) => {
    onClose();
    fn();
  };

  const toggleGroup = (groupName: string) => {
    let newGroups = [...currentGroups];
    if (newGroups.includes(groupName)) {
      newGroups = newGroups.filter((g) => g !== groupName);
    } else {
      newGroups.push(groupName);
    }

    if (isBookmarked) {
      modifyBookmarks([media.id], { groups: newGroups });
    } else if (meta) {
      addBookmarkWithGroups(meta, newGroups);
    }
  };

  const handleCreateFolder = (e: FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || allGroups.length >= 30) return;

    const newGroupString = createGroupString("BOOKMARK", newFolderName.trim());
    toggleGroup(newGroupString);
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const handleCopyLink = () => {
    if (!canLink) return;
    copyToClipboard(absoluteLink);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  const handleToggleBookmark = () => {
    if (!meta) return;
    if (isBookmarked) removeBookmark(media.id);
    else addBookmarkWithGroups(meta, currentGroups);
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose} className="min-w-[220px]">
      <ContextMenuHeader>{media.title || "Media"}</ContextMenuHeader>

      {canLink ? (
        <ContextMenuItem
          onClick={() =>
            closeAnd(() => {
              navigate(link);
            })
          }
        >
          <Icon icon={Icons.PLAY} className="text-lg w-5" />
          <span className="flex-1">
            {showResume
              ? t("media.contextMenu.resume")
              : media.type === "manga"
                ? t("media.contextMenu.openReader")
                : t("media.contextMenu.play")}
          </span>
        </ContextMenuItem>
      ) : null}

      <ContextMenuItem onClick={() => closeAnd(onShowDetails)}>
        <Icon icon={Icons.CIRCLE_EXCLAMATION} className="text-lg w-5" />
        <span className="flex-1">{t("bookmarks.folders.moreInfo")}</span>
      </ContextMenuItem>

      {onEdit ? (
        <ContextMenuItem onClick={() => closeAnd(onEdit)}>
          <Icon icon={Icons.EDIT} className="text-lg w-5" />
          <span className="flex-1">{t("bookmarks.folders.editDetails")}</span>
        </ContextMenuItem>
      ) : null}

      <ContextMenuDivider />

      {meta ? (
        <ContextMenuItem onClick={handleToggleBookmark}>
          <Icon
            icon={isBookmarked ? Icons.BOOKMARK : Icons.BOOKMARK_OUTLINE}
            className={classNames(
              "text-lg w-5",
              isBookmarked ? "text-type-link" : "",
            )}
          />
          <span className="flex-1">
            {isBookmarked
              ? t("media.contextMenu.removeBookmark")
              : t("media.contextMenu.addBookmark")}
          </span>
        </ContextMenuItem>
      ) : null}

      {canLink ? (
        <>
          <ContextMenuItem onClick={handleCopyLink}>
            <Icon icon={Icons.COPY} className="text-lg w-5" />
            <span className="flex-1">
              {copiedLink
                ? t("media.contextMenu.copied")
                : t("media.contextMenu.copyLink")}
            </span>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() =>
              closeAnd(() => {
                window.open(absoluteLink, "_blank", "noopener,noreferrer");
              })
            }
          >
            <Icon icon={Icons.LINK} className="text-lg w-5" />
            <span className="flex-1">{t("media.contextMenu.openNewTab")}</span>
          </ContextMenuItem>
        </>
      ) : null}

      {tmdbUrl ? (
        <ContextMenuItem
          onClick={() =>
            closeAnd(() => {
              window.open(tmdbUrl, "_blank", "noopener,noreferrer");
            })
          }
        >
          <Icon icon={Icons.TMDB} className="text-lg w-5" />
          <span className="flex-1">{t("media.contextMenu.viewOnTmdb")}</span>
        </ContextMenuItem>
      ) : null}

      {hasWatchingProgress || (percentage !== undefined && percentage > 0) ? (
        <>
          <ContextMenuDivider />
          <ContextMenuItem
            className="text-semantic-rose-c100 hover:bg-semantic-rose/10"
            onClick={() =>
              closeAnd(() => {
                removeFromWatching(media.id);
              })
            }
          >
            <Icon icon={Icons.X} className="text-lg w-5" />
            <span className="flex-1">{t("media.contextMenu.removeWatching")}</span>
          </ContextMenuItem>
        </>
      ) : null}

      {meta ? (
        <>
          <ContextMenuDivider />
          <ContextMenuSectionLabel
            trailing={t("bookmarks.folders.counter", {
              count: allGroups.length,
              max: 30,
            })}
          >
            {t("bookmarks.folders.title")}
          </ContextMenuSectionLabel>

          {allGroups.length === 0 && !isCreatingFolder ? (
            <div className="px-4 py-2 text-sm text-white/30 italic">
              {t("bookmarks.folders.empty")}
            </div>
          ) : null}

          {allGroups.map((group) => {
            const { name } = parseGroupString(group);
            const isInGroup = currentGroups.includes(group);
            return (
              <ContextMenuItem key={group} onClick={() => toggleGroup(group)}>
                <Icon
                  icon={isInGroup ? Icons.CHECKMARK : Icons.BOOKMARK}
                  className={classNames(
                    "text-lg w-5",
                    isInGroup ? "text-type-link" : "",
                  )}
                />
                <span
                  className={classNames(
                    "flex-1 truncate",
                    isInGroup ? "text-type-link font-medium" : "",
                  )}
                >
                  {name}
                </span>
              </ContextMenuItem>
            );
          })}

          {!isCreatingFolder ? (
            <ContextMenuItem
              onClick={() => setIsCreatingFolder(true)}
              className="mt-1"
              disabled={allGroups.length >= 30}
            >
              <Icon icon={Icons.PLUS} className="text-lg w-5" />
              <span className="flex-1">{t("bookmarks.folders.createFolder")}</span>
            </ContextMenuItem>
          ) : (
            <div className="px-3 py-2 mt-1 bg-white/5 rounded mx-1">
              <form
                onSubmit={handleCreateFolder}
                className="flex gap-2 items-center"
              >
                <input
                  autoFocus
                  type="text"
                  placeholder={t("bookmarks.folders.folderNamePlaceholder")}
                  className="w-full bg-transparent outline-none text-sm text-white placeholder-white/30"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                />
                <button
                  type="submit"
                  className="text-type-link hover:text-white transition-colors"
                  disabled={!newFolderName.trim()}
                >
                  <Icon icon={Icons.CHECKMARK} />
                </button>
              </form>
            </div>
          )}
        </>
      ) : null}
    </ContextMenu>
  );
}
