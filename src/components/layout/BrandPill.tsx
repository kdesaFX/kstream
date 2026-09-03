import classNames from "classnames";
import { useTranslation } from "react-i18next";

import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";

/** User-provided mark with baked-in drop shadow — no CSS filter. */
const LOGO_SRC = "/logo.png?v=8";

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      draggable={false}
      className={classNames("no-fade select-none object-contain", className)}
      aria-hidden
    />
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

  // Header / hero: bare mark only (no wordmark, no pill).
  if (props.header || props.minimal) {
    return (
      <div
        className={classNames(
          "flex items-center",
          props.clickable
            ? "transition-transform duration-300 hover:scale-110 active:scale-95"
            : "",
        )}
      >
        <BrandMark className="h-9 w-9 shrink-0 lg:h-11 lg:w-11" />
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
