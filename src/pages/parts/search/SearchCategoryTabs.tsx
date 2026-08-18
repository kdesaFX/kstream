import classNames from "classnames";
import { useTranslation } from "react-i18next";

export type SearchCategory = "watch" | "manga";

export function SearchCategoryTabs({
  active,
  onChange,
  showManga,
}: {
  active: SearchCategory;
  onChange: (tab: SearchCategory) => void;
  showManga: boolean;
}) {
  const { t } = useTranslation();
  const tabClass = (selected: boolean) =>
    classNames(
      "text-xl md:text-2xl font-bold p-2 bg-transparent text-center rounded-full cursor-pointer transition-colors duration-200",
      selected ? "text-type-link" : "text-type-secondary",
    );

  return (
    <div className="mb-6 flex justify-center space-x-4">
      <button
        type="button"
        className={tabClass(active === "watch")}
        onClick={() => onChange("watch")}
      >
        {t("home.search.sectionTitle")}
      </button>
      {showManga ? (
        <button
          type="button"
          className={tabClass(active === "manga")}
          onClick={() => onChange("manga")}
        >
          {t("home.search.mangaSectionTitle")}
        </button>
      ) : null}
    </div>
  );
}
