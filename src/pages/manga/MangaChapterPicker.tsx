import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { chapterLabel } from "@/backend/manga/mangadex";
import type { MangaChapter } from "@/backend/manga/types";
import { Icon, Icons } from "@/components/Icon";

const NEIGHBOR_ROWS = 2;

export function MangaChapterPicker({
  chapters,
  currentChapterId,
  onSelect,
}: {
  chapters: MangaChapter[];
  currentChapterId?: string;
  onSelect: (chapter: MangaChapter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const currentIndex = useMemo(
    () => chapters.findIndex((c) => c.id === currentChapterId),
    [chapters, currentChapterId],
  );

  useEffect(() => {
    if (currentIndex >= 0) setFocusIndex(currentIndex);
  }, [currentIndex]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector(
      `[data-chapter-idx="${focusIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [open, focusIndex]);

  const windowStart = Math.max(0, focusIndex - NEIGHBOR_ROWS);
  const windowEnd = Math.min(
    chapters.length,
    windowStart + NEIGHBOR_ROWS * 2 + 1,
  );
  const visible = chapters.slice(windowStart, windowEnd);

  const pick = useCallback(
    (ch: MangaChapter) => {
      onSelect(ch);
      setOpen(false);
    },
    [onSelect],
  );

  const moveFocus = useCallback((delta: number) => {
    setFocusIndex((prev) =>
      Math.min(chapters.length - 1, Math.max(0, prev + delta)),
    );
  }, [chapters.length]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      moveFocus(e.deltaY > 0 ? 1 : -1);
    },
    [moveFocus],
  );

  const current = currentIndex >= 0 ? chapters[currentIndex] : undefined;

  return (
    <div
      className="relative max-w-[14rem]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="flex items-center gap-1 truncate text-xs text-white/60 hover:text-white transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="truncate">
          {current ? chapterLabel(current) : "…"}
        </span>
        <Icon icon={Icons.CHEVRON_DOWN} className="text-[10px] shrink-0" />
      </button>

      {open && chapters.length > 0 ? (
        <div
          ref={listRef}
          className="absolute left-0 top-full z-40 mt-1 min-w-[15rem] max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/95 py-1 shadow-xl"
          onWheel={onWheel}
        >
          {windowStart > 0 ? (
            <div className="px-3 py-1 text-[10px] text-white/30">…</div>
          ) : null}
          {visible.map((ch, i) => {
            const idx = windowStart + i;
            const selected = ch.id === currentChapterId;
            const focused = idx === focusIndex;
            return (
              <button
                key={ch.id}
                type="button"
                data-chapter-idx={idx}
                className={classNames(
                  "block w-full truncate px-3 py-1.5 text-left text-xs transition-colors",
                  selected || focused
                    ? "bg-white/15 text-white"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
                onMouseEnter={() => setFocusIndex(idx)}
                onClick={() => pick(ch)}
              >
                {chapterLabel(ch)}
              </button>
            );
          })}
          {windowEnd < chapters.length ? (
            <div className="px-3 py-1 text-[10px] text-white/30">…</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
