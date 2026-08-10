import classNames from "classnames";
import { useTranslation } from "react-i18next";

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
        props.header ? "h-10 px-2.5 md:px-4" : "px-4 py-2",
        props.header
          ? "bg-black/25 backdrop-blur-md border border-white/10"
          : props.backgroundClass ??
              "bg-pill-background bg-opacity-50 backdrop-blur-lg",
        props.clickable
          ? "transition-[transform,background-color,border-color] hover:scale-105 hover:bg-black/35 hover:border-white/15 hover:text-type-logo active:scale-95"
          : "",
      )}
    >
      <img
        src="/logo.png?v=6"
        alt={t("global.name")}
        width={24}
        height={24}
        className="h-6 w-6 object-contain"
        draggable={false}
      />
      <span className="hidden md:inline font-semibold text-white">
        {t("global.name")}
      </span>
    </div>
  );
}
