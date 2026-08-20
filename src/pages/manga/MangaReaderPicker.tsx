import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon, Icons } from "@/components/Icon";

export interface MangaReaderPickerItem {
  id: string;
  label: string;
}

function itemMatches(item: MangaReaderPickerItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
  );
}

/** Only one reader picker menu can be open; opening another closes this one. */
let exclusiveClose: (() => void) | null = null;

function takeExclusiveOpen(close: () => void) {
  if (exclusiveClose && exclusiveClose !== close) exclusiveClose();
  exclusiveClose = close;
}

function dropExclusiveOpen(close: () => void) {
  if (exclusiveClose === close) exclusiveClose = null;
}

export function MangaReaderPicker({
  items,
  selectedId,
  searchPlaceholder,
  emptyLabel,
  emptyTriggerLabel,
  onSelect,
}: {
  items: MangaReaderPickerItem[];
  selectedId?: string;
  searchPlaceholder: string;
  emptyLabel: string;
  emptyTriggerLabel?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();
  const closeMenuRef = useRef<() => void>(() => {});
  const exclusiveCloseRef = useRef(() => {
    closeMenuRef.current();
  });

  const current = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId],
  );

  const visible = useMemo(
    () => items.filter((item) => itemMatches(item, query)),
    [items, query],
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
    dropExclusiveOpen(exclusiveCloseRef.current);
  }, [cancelClose]);
  closeMenuRef.current = closeMenu;

  const openMenu = useCallback(
    (pin = false) => {
      cancelClose();
      takeExclusiveOpen(exclusiveCloseRef.current);
      if (pin) setPinned(true);
      setOpen(true);
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 320);
  }, [pinned, cancelClose]);

  useEffect(() => () => {
    cancelClose();
    dropExclusiveOpen(exclusiveCloseRef.current);
  }, [cancelClose]);

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
  }, [open, query, selectedId]);

  const pick = useCallback(
    (id: string) => {
      onSelect(id);
      closeMenu();
    },
    [onSelect, closeMenu],
  );

  const triggerLabel = current?.label ?? emptyTriggerLabel ?? "…";

  return (
    <div
      ref={rootRef}
      className="relative max-w-[16rem] shrink-0"
      onMouseEnter={() => openMenu()}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="flex items-center gap-1 truncate text-xs text-white/60 hover:text-white transition-colors"
        onClick={() => {
          if (open && pinned) {
            closeMenu();
            return;
          }
          openMenu(true);
        }}
        aria-expanded={open}
      >
        <span className="truncate">{triggerLabel}</span>
        <Icon icon={Icons.CHEVRON_DOWN} className="text-[10px] shrink-0" />
      </button>

      {open ? (
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
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
                aria-label={searchPlaceholder}
              />
            </div>
            <div
              ref={listRef}
              className="max-h-64 overflow-y-auto overscroll-contain py-1"
            >
              {visible.length === 0 ? (
                <div className="px-3 py-3 text-xs text-white/40">
                  {emptyLabel}
                </div>
              ) : (
                visible.map((item) => {
                  const selected = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-current={selected ? "true" : undefined}
                      className={classNames(
                        "block w-full truncate px-3 py-1.5 text-left text-xs transition-colors",
                        selected
                          ? "bg-white/15 text-white"
                          : "text-white/65 hover:bg-white/10 hover:text-white",
                      )}
                      onClick={() => pick(item.id)}
                    >
                      {item.label}
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
