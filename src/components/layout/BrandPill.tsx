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
        "flex items-center space-x-2 rounded-full px-4 py-2 text-type-logo backdrop-blur-lg",
        props.backgroundClass ?? "bg-pill-background bg-opacity-50",
        props.clickable
          ? "transition-[transform,background-color] hover:scale-105 hover:bg-pill-backgroundHover hover:text-type-logo active:scale-95"
          : "",
      )}
    >
      <img
        src="/logo.png?v=6"
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 object-contain"
        draggable={false}
      />
      <span className="font-semibold text-white">{t("global.name")}</span>
    </div>
  );
}
