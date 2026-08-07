import classNames from "classnames";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { useDiscoverOptions } from "@/pages/discover/hooks/useDiscoverMedia";
import { getGenreIcon } from "@/pages/discover/lib/genreIcons";
import { useDiscoverStore } from "@/stores/discover";

const TOP_GENRES = 5;

export function GenreChips() {
  const { genres, isLoading } = useDiscoverOptions("movie");
  const setSelectedCategory = useDiscoverStore((s) => s.setSelectedCategory);
  const [expanded, setExpanded] = useState(false);

  if (isLoading || genres.length === 0) return null;

  const hasMore = genres.length > TOP_GENRES;
  const visible = expanded ? genres : genres.slice(0, TOP_GENRES);

  return (
    <div className="w-full mt-6">
      <div
        className={classNames(
          "flex gap-2 py-2 opacity-0 animate-fade-in",
          "transition-[max-height] duration-1000 ease-in-out overflow-hidden",
          expanded
            ? "flex-wrap justify-center max-h-[40rem]"
            : "flex-nowrap justify-center max-h-16 overflow-x-auto scrollbar-none",
        )}
        style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}
      >
        {visible.map((genre) => (
          <Link
            key={genre.id}
            to="/"
            onClick={() => setSelectedCategory("movies")}
            className={classNames(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap shrink-0",
              "bg-search-background/40 backdrop-blur-md hover:bg-search-hoverBackground/80",
              "text-type-secondary hover:text-white border border-white/5 hover:border-white/15 select-none",
              "transition-all duration-200 ease-out-quint",
              "hover:-translate-y-0.5 active:translate-y-0 active:scale-95 hover:shadow-soft-md",
            )}
          >
            <Icon
              icon={getGenreIcon(genre.name)}
              className="text-[14px] opacity-70"
            />
            {genre.name || "Unknown"}
          </Link>
        ))}

        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={classNames(
              "flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide whitespace-nowrap shrink-0",
              "min-w-[5.5rem]",
              "bg-search-background/60 backdrop-blur-md hover:bg-search-hoverBackground",
              "text-type-secondary hover:text-white border border-white/40 hover:border-white/60",
              "transition-all duration-200 ease-out-quint",
              "hover:-translate-y-0.5 active:translate-y-0 active:scale-95 hover:shadow-soft-md select-none",
            )}
          >
            <Icon icon={expanded ? Icons.CHEVRON_UP : Icons.PLUS} />
            {expanded ? "Less" : "More"}
          </button>
        )}
      </div>
    </div>
  );
}
