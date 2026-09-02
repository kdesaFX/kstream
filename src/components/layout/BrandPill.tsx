import classNames from "classnames";
import { useTranslation } from "react-i18next";

import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  /** Hero-overlaid mobile mark — logo only, no frosted pill chrome. */
  minimal?: boolean;
  backgroundClass?: string;
}) {
  const { t } = useTranslation();

  if (props.minimal) {
    return (
      <div
        className={classNames(
          "flex h-10 w-10 items-center justify-center rounded-full text-white",
          props.clickable ? "hover:bg-white/10 active:scale-95" : "",
        )}
      >
        <img
          src="/logo.png?v=6"
          alt={t("global.name")}
          width={22}
          height={22}
          className="h-[1.35rem] w-[1.35rem] shrink-0 object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "flex items-center gap-2 rounded-full text-type-logo",
        props.header
          ? "h-10 gap-1.5 px-2.5 text-sm md:h-[2.67rem] md:gap-2 md:px-3.5 md:text-base"
          : "px-4 py-2",
        props.backgroundClass ?? navControlSurface,
        props.clickable
          ? classNames(navControlHover, "hover:text-type-logo")
          : "",
      )}
    >
      <img
        src="/logo.png?v=6"
        alt={t("global.name")}
        width={20}
        height={20}
        className={
          props.header
            ? "h-5 w-5 shrink-0 object-contain"
            : "h-6 w-6 object-contain"
        }
        draggable={false}
      />
      <span className="hidden md:inline font-semibold text-white">
        {t("global.name")}
      </span>
    </div>
  );
}
