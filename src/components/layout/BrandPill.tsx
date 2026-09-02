import classNames from "classnames";
import { useTranslation } from "react-i18next";

import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";

/** Cinejoy-style multi-layer drop shadow for a bare brand mark over hero art. */
const logoLegibleClass = "logo-legible";

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  /** Hero-overlaid mobile mark — logo only, no frosted pill chrome. */
  minimal?: boolean;
  backgroundClass?: string;
}) {
  const { t } = useTranslation();

  // Header / hero: bare mark (+ optional name) with drop shadow — no frosted pill.
  if (props.header || props.minimal) {
    return (
      <div
        className={classNames(
          "flex items-center gap-2 text-white",
          props.minimal
            ? "h-10"
            : "h-10 md:h-11",
          props.clickable
            ? "transition-transform duration-300 hover:scale-110 active:scale-95"
            : "",
        )}
      >
        <img
          src="/logo.png?v=7"
          alt={t("global.name")}
          width={44}
          height={44}
          decoding="async"
          className={classNames(
            "no-fade shrink-0 object-contain select-none",
            logoLegibleClass,
            props.minimal
              ? "h-9 w-9"
              : "h-9 w-9 md:h-11 md:w-11",
          )}
          draggable={false}
        />
        {!props.minimal ? (
          <span
            className={classNames(
              "hidden font-semibold text-white md:inline",
              logoLegibleClass,
            )}
          >
            {t("global.name")}
          </span>
        ) : null}
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
      <img
        src="/logo.png?v=7"
        alt={t("global.name")}
        width={20}
        height={20}
        decoding="async"
        className="no-fade h-6 w-6 object-contain"
        draggable={false}
      />
      <span className="font-semibold text-white">{t("global.name")}</span>
    </div>
  );
}
