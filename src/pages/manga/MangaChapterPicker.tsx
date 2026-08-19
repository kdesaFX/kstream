import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { chapterLabel } from "@/backend/manga/mangadex";
import type { MangaChapter } from "@/backend/manga/types";
import { Icon, Icons } from "@/components/Icon";

function chapterMatches(ch: MangaChapter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const number = (ch.chapter ?? "").toLowerCase();
  const title = (ch.title ?? "").toLowerCase();
  const label = chapterLabel(ch).toLowerCase();
  if (label.includes(q) || title.includes(q)) return true;
  if (number && (number === q || number.startsWith(q))) return true;
  return false;
}

export function MangaChapterPicker({
  chapters,
  currentChapterId,
  onSelect,
}: {
  chapters: MangaChapter[];
  currentChapterId?: string;
  onSelect: (chapter: MangaChapter) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();

  const currentIndex = useMemo(
    () => chapters.findIndex((c) => c.id === currentChapterId),
    [chapters, currentChapterId],
  );
  const current = currentIndex >= 0 ? chapters[currentIndex] : undefined;

  const visible = useMemo(
    () => chapters.filter((ch) => chapterMatches(ch, query)),
    [chapters, query],
  );

  const cancelClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);

  const closeMenu = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
    setQuery("");
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 320);
  }, [pinned, cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open || query.trim() || !listRef.current) return;
    const row = listRef.current.querySelector("[data-current='true']");
    row?.scrollIntoView({ block: "nearest" });
  }, [open, query, currentChapterId]);

  const pick = useCallback(
    (ch: MangaChapter) => {
      onSelect(ch);
      closeMenu();
    },
    [onSelect, closeMenu],
  );

  return (
    <div
      ref={rootRef}
      className="relative max-w-[16rem]"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="flex items-center gap-1 truncate text-xs text-white/60 hover:text-white transition-colors"
        onClick={() => {
          cancelClose();
          if (open && pinned) {
            closeMenu();
            return;
          }
          setPinned(true);
          setOpen(true);
        }}
        aria-expanded={open}
      >
        <span className="truncate">
          {current ? chapterLabel(current) : "…"}
        </span>
        <Icon icon={Icons.CHEVRON_DOWN} className="text-[10px] shrink-0" />
      </button>

      {open && chapters.length > 0 ? (
        <div
          className="absolute left-0 top-full z-40 w-[18rem] pt-2"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            closeMenu();
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/95 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1.5">
              <Icon icon={Icons.SEARCH} className="text-[11px] text-white/40" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("manga.reader.chapterSearch")}
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
                aria-label={t("manga.reader.chapterSearch")}
              />
            </div>
            <div
              ref={listRef}
              className="max-h-64 overflow-y-auto overscroll-contain py-1"
            >
              {visible.length === 0 ? (
                <div className="px-3 py-3 text-xs text-white/40">
                  {t("manga.reader.chapterSearchEmpty")}
                </div>
              ) : (
                visible.map((ch) => {
                  const selected = ch.id === currentChapterId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      data-current={selected ? "true" : undefined}
                      className={classNames(
                        "block w-full truncate px-3 py-1.5 text-left text-xs transition-colors",
                        selected
                          ? "bg-white/15 text-white"
                          : "text-white/65 hover:bg-white/10 hover:text-white",
                      )}
                      onClick={() => pick(ch)}
                    >
                      {chapterLabel(ch)}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
