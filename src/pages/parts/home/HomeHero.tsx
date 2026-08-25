import classNames from "classnames";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { SearchBarInput } from "@/components/form/SearchBar";
import { useSlashFocus } from "@/components/player/hooks/useSlashFocus";
import { HeroTitle } from "@/components/text/HeroTitle";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";

function homeTitleKey(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month === 4 && day === 20) return "home.titles.420";
  if (month === 6 && day === 9) return "home.titles.69";
  if (month === 10 && day === 31) return "home.titles.halloween";
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "home.titles.morning";
  if (hour >= 12 && hour < 18) return "home.titles.day";
  return "home.titles.night";
}

/** Classic search-first hero used when Featured is off (Optimize Low / Mid). */
export function HomeHero(props: { searching?: boolean }) {
  const { t } = useTranslation();
  const { t: randomT } = useRandomTranslation();
  const { isMobile } = useIsMobile();
  const [search, setSearch, setSearchUnFocus] = useSearchQuery();
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);

  const title = useMemo(() => randomT(homeTitleKey()), [randomT]);
  const placeholder = isMobile
    ? (t("home.search.placeholder.defaultMobile") ??
      t("home.search.placeholder.default") ??
      "")
    : (randomT("home.search.placeholder") ?? "");

  return (
    <div
      className={classNames(
        "relative w-full transition-[height,opacity] duration-300 ease-in-out",
        props.searching
          ? "h-24 opacity-0 pointer-events-none"
          : "min-h-[22rem] md:min-h-[28rem] opacity-100",
      )}
    >
      <div className="absolute inset-x-0 top-[30%] md:top-[35%] flex flex-col items-center px-6 text-center gap-6">
        <HeroTitle className="max-w-3xl">{title}</HeroTitle>
        <div className="w-full max-w-xl pointer-events-auto">
          <SearchBarInput
            ref={inputRef}
            onChange={setSearch}
            value={search}
            onUnFocus={setSearchUnFocus}
            placeholder={placeholder}
            large
            hideTooltip={isMobile}
          />
        </div>
      </div>
    </div>
  );
}
