import classNames from "classnames";
import { useCallback } from "react";

import { Icon, Icons } from "@/components/Icon";
import {
  MediaRating,
  RateMediaMeta,
  useRatingsStore,
} from "@/stores/ratings";

interface MediaRatingCapsuleProps {
  media: RateMediaMeta;
}

const SEGMENTS: Array<{
  rating: MediaRating;
  icon: Icons;
  label: string;
  activeClass: string;
}> = [
  {
    rating: "loved",
    icon: Icons.HEART,
    label: "Love it",
    activeClass: "bg-pill-backgroundHover text-red-400",
  },
  {
    rating: "liked",
    icon: Icons.THUMBS_UP,
    label: "Like",
    activeClass: "bg-pill-backgroundHover text-white",
  },
  {
    rating: "disliked",
    icon: Icons.THUMBS_DOWN,
    label: "Dislike",
    activeClass: "bg-pill-backgroundHover text-white",
  },
  {
    rating: "hated",
    icon: Icons.HEART_CRACK,
    label: "Hate it",
    activeClass: "bg-pill-backgroundHover text-red-400",
  },
];

/**
 * A pill split into four segments (love | like | dislike | hate).
 * Ratings feed the "For You" recommendation algorithm; the outer
 * segments weigh roughly twice as much as the inner ones.
 */
export function MediaRatingCapsule({ media }: MediaRatingCapsuleProps) {
  const rating = useRatingsStore((s) => s.ratings[media.tmdbId]?.rating);
  const toggleRating = useRatingsStore((s) => s.toggleRating);

  const rate = useCallback(
    (value: MediaRating) => {
      if (!media.tmdbId) return;
      toggleRating(media, value);
    },
    [media, toggleRating],
  );

  return (
    <div className="flex items-center overflow-hidden rounded-full bg-pill-background">
      {SEGMENTS.map((segment, index) => (
        <div key={segment.rating} className="flex items-center">
          {index > 0 && <div className="h-6 w-px bg-white/20" />}
          <button
            type="button"
            title={segment.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              rate(segment.rating);
            }}
            className={classNames(
              "flex h-12 w-9 items-center justify-center transition-[background-color,color,transform] duration-75 cursor-pointer hover:text-white active:scale-110",
              index === 0 && "pl-1",
              index === SEGMENTS.length - 1 && "pr-1",
              rating === segment.rating
                ? segment.activeClass
                : "hover:bg-pill-backgroundHover",
            )}
          >
            <Icon icon={segment.icon} />
          </button>
        </div>
      ))}
    </div>
  );
}
