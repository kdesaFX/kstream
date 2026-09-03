import classNames from "classnames";
import { useTranslation } from "react-i18next";

import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";

/** Vector broadcast mark — CSS drop-shadow follows paths; PNG fringe looked broken. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        d="M37 36c-8 8-8 20 0 28M63 36c8 8 8 20 0 28"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        d="M28 27c-13 13-13 33 0 46M72 27c13 13 13 33 0 46"
      />
    </svg>
  );
}

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  /** Hero-overlaid mobile mark — logo only, no frosted pill chrome. */
  minimal?: boolean;
  backgroundClass?: string;
}) {
  const { t } = useTranslation();

  // Header / hero: cinejoy-style bare mark only (no wordmark, no pill).
  if (props.header || props.minimal) {
    return (
      <div
        className={classNames(
          "flex items-center text-type-logo",
          props.clickable
            ? "transition-transform duration-300 hover:scale-110 active:scale-95"
            : "",
        )}
      >
        <BrandMark
          className={classNames(
            "logo-legible h-9 w-9 shrink-0 select-none lg:h-11 lg:w-11",
          )}
        />
        <span className="sr-only">{t("global.name")}</span>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex items-center gap-2 rounded-full text-type-logo",
        "px-4 py-2",
        props.backgroundClass ?? navControlSurface,
        props.clickable
          ? classNames(navControlHover, "hover:text-type-logo")
          : "",
      )}
    >
      <BrandMark className="h-6 w-6 shrink-0" />
      <span className="font-semibold text-white">{t("global.name")}</span>
    </div>
  );
}
