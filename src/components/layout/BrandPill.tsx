import classNames from "classnames";
import { useTranslation } from "react-i18next";

import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";

export function BrandPill(props: {
  clickable?: boolean;
  header?: boolean;
  backgroundClass?: string;
}) {
  const { t } = useTranslation();

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
