import c from "classnames";
import { forwardRef, useRef, useState } from "react";

import { Flare } from "@/components/utils/Flare";

import { Icon, Icons } from "../Icon";
import { TextInputControl } from "../text-inputs/TextInputControl";

export interface SearchBarProps {
  placeholder?: string;
  onChange: (value: string, force: boolean) => void;
  onUnFocus: (newSearch?: string) => void;
  value: string;
  isSticky?: boolean;
  isInFeatured?: boolean;
  hideTooltip?: boolean;
  compact?: boolean;
  /** Larger control for the main nav (scaled ~0.75× from the prior oversized size). */
  large?: boolean;
}

export const SearchBarInput = forwardRef<HTMLInputElement, SearchBarProps>(
  (props, ref) => {
    const [focused, setFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const large = Boolean(props.large) && !props.compact;

    function setSearch(value: string) {
      props.onChange(value, false);
    }

    return (
      <div ref={containerRef}>
        <Flare.Base
          className={c(
            "hover:flare-enabled group flex flex-col rounded-full transition-colors sm:flex-row sm:items-center relative backdrop-blur-lg",
            showTooltip
              ? large
                ? "min-h-12"
                : "min-h-10"
              : large
                ? "h-12"
                : "h-10",
            focused
              ? "bg-pill-background/80"
              : "bg-pill-background/50",
          )}
        >
          <Flare.Light
            flareSize={400}
            enabled={focused}
            className="rounded-full"
            backgroundClass={c(
              "transition-colors",
              focused ? "bg-pill-background/80" : "bg-pill-background/50",
            )}
          />
          <Flare.Child className="flex h-full flex-1 flex-col justify-center">
            <div
              className={c(
                "absolute bottom-0 top-0 flex items-center text-search-icon cursor-pointer z-10",
                large
                  ? "left-4 text-base"
                  : props.compact
                    ? "left-2.5 text-sm"
                    : "left-4",
              )}
              onClick={(e) => {
                e.preventDefault();
                setShowTooltip(!showTooltip);
                if (ref && typeof ref !== "function" && ref.current) {
                  ref.current.focus();
                }
              }}
            >
              <Icon icon={Icons.SEARCH} />
            </div>

            <TextInputControl
              ref={ref}
              onUnFocus={() => {
                setFocused(false);
                props.onUnFocus();
              }}
              onFocus={() => setFocused(true)}
              onChange={(val) => setSearch(val)}
              value={props.value}
              className={c(
                "w-full flex-1 bg-transparent !text-search-text focus:outline-none pr-2 leading-none",
                // Near-white placeholder so it stays readable on dark pill backgrounds
                "placeholder:text-white/70",
                large
                  ? "h-12 px-4 pl-11 text-base"
                  : props.compact
                    ? "h-10 px-2.5 pl-8 text-xs"
                    : "h-10 px-4 pl-11 text-base",
                "select-none",
              )}
              placeholder={props.placeholder}
            />

            {showTooltip && !props.hideTooltip && (
              <div className="py-4">
                <p className="font-bold text-sm mb-1 text-search-text">
                  Search:
                </p>
                <div className="space-y-1.5 text-xs text-search-text">
                  <div>
                    <p className="mb-0.5">TMDB ID search:</p>
                    <p className="text-type-secondary italic pl-2">
                      tmdb:123456 - For movies
                    </p>
                    <p className="text-type-secondary italic pl-2">
                      tmdb:123456:tv - For TV shows
                    </p>
                  </div>
                </div>
              </div>
            )}

            {props.value.length > 0 && (
              <div
                onClick={() => {
                  props.onUnFocus("");
                  if (ref && typeof ref !== "function") {
                    ref.current?.focus();
                  }
                }}
                className={c(
                  "cursor-pointer hover:text-white absolute bottom-0 right-1.5 top-0 flex justify-center my-auto items-center hover:bg-search-hoverBackground active:scale-110 text-search-icon rounded-full transition-[transform,background-color] duration-200",
                  large
                    ? "h-9 w-9 text-base"
                    : props.compact
                      ? "h-8 w-8 text-sm"
                      : "h-10 w-10",
                )}
              >
                <Icon
                  icon={Icons.X}
                  className="transition-colors duration-200"
                />
              </div>
            )}
          </Flare.Child>
        </Flare.Base>
      </div>
    );
  },
);
