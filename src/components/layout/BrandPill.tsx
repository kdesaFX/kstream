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
        props.header
          ? "h-12 px-3 text-base md:h-16 md:px-5 md:text-lg"
          : "px-4 py-2",
        props.header
          ? "bg-black/55 backdrop-blur-md border border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : props.backgroundClass ??
              "bg-pill-background bg-opacity-50 backdrop-blur-lg",
        props.clickable
          ? props.header
            ? "transition-[transform,background-color,border-color,box-shadow] hover:scale-105 hover:bg-black/70 hover:border-white/40 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)] hover:text-type-logo active:scale-95"
            : "transition-[transform,background-color,border-color] hover:scale-105 hover:bg-black/35 hover:border-white/15 hover:text-type-logo active:scale-95"
          : "",
      )}
    >
      <img
        src="/logo.png?v=6"
        alt={t("global.name")}
        width={props.header ? 36 : 24}
        height={props.header ? 36 : 24}
        className={
          props.header
            ? "h-7 w-7 md:h-9 md:w-9 object-contain"
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
