import classNames from "classnames";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWindowSize } from "react-use";
import Sticky from "react-sticky-el";

import { SearchBarInput } from "@/components/form/SearchBar";
import { Icon, Icons } from "@/components/Icon";
import { ThinContainer } from "@/components/layout/ThinContainer";
import { useSlashFocus } from "@/components/player/hooks/useSlashFocus";
import { HeroTitle } from "@/components/text/HeroTitle";
import { useIsIOS, useIsMobile, useIsPWA } from "@/hooks/useIsMobile";
import { useIsTV } from "@/hooks/useIsTv";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useBannerSize } from "@/stores/banner";
import { useNavLayoutStore } from "@/stores/navLayout";

import { GenreChips } from "./GenreChips";

// Breathing room to keep between the search row and each icon cluster,
// matching the 12px gap (space-x-3/gap-3) the nav already uses between its
// own icon buttons at desktop widths.
const ROW_GUTTER = 12;
const MIN_ROW_WIDTH = 280;
// The nav's icon clusters are measured from their own wrapper div, which
// sits inside the nav's px-7 (28px) page padding — that padding isn't part
// of the measured width, so it has to be added back in separately.
const NAV_PAGE_PADDING = 28;

export interface HeroPartProps {
  setIsSticky: (val: boolean) => void;
  searchParams: ReturnType<typeof useSearchQuery>;
  showTitle?: boolean;
  isInFeatured?: boolean;
}

function getTimeOfDay(
  date: Date,
): "night" | "morning" | "day" | "420" | "69" | "halloween" {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 4 && day === 20) return "420";
  if (month === 6 && day === 9) return "69";
  if (month === 10 && day === 31) return "halloween";
  const hour = date.getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 19) return "day";
  return "night";
}

export function HeroPart({
  setIsSticky,
  searchParams,
  showTitle,
  isInFeatured,
}: HeroPartProps) {
  const { t: randomT } = useRandomTranslation();
  const [search, setSearch, setSearchUnFocus] = searchParams;
  const [showBg, setShowBg] = useState(false);
  const bannerSize = useBannerSize();
  const { isMobile } = useIsMobile();
  const { isTV } = useIsTV();
  const compact = isMobile;

  const { width: windowWidth } = useWindowSize();
  const leftIconsWidth = useNavLayoutStore((s) => s.leftWidth);
  const rightIconsWidth = useNavLayoutStore((s) => s.rightWidth);
  // On desktop, when the hero sits over the featured carousel, the search
  // row visually shares the top of the page with the nav icon clusters, so
  // it needs to shrink to fit the exact gap between them instead of using a
  // fixed width that can overlap. Insets are computed independently per
  // side (not symmetric) since the clusters are often uneven widths (e.g.
  // the "Layout" button only showing on the home page). This only applies
  // to the featured-carousel hero — the plain hero (no carousel) was never
  // sharing space with the icons and should stay simply centered. Mobile
  // stacks the search row below the icons on its own line either way, so
  // this doesn't apply there.
  const hasMeasurements =
    isInFeatured &&
    !isMobile &&
    leftIconsWidth > 0 &&
    rightIconsWidth > 0;
  const rowLeftInset = leftIconsWidth + NAV_PAGE_PADDING + ROW_GUTTER;
  const rowRightInset = rightIconsWidth + NAV_PAGE_PADDING + ROW_GUTTER;
  const rowWidth = hasMeasurements
    ? Math.max(MIN_ROW_WIDTH, windowWidth - rowLeftInset - rowRightInset)
    : null;

  const stickStateChanged = useCallback(
    (isFixed: boolean) => {
      setShowBg(isFixed);
      setIsSticky(isFixed);
    },
    [setIsSticky],
  );

  const isPWA = useIsPWA();
  const isIOS = useIsIOS();
  const isIOSPWA = isIOS && isPWA;

  // Navbar height is 80px (h-20)
  const navbarHeight = 80;
  // On desktop: inline with navbar (same top position + 14px adjustment)
  // On mobile: below navbar (navbar height + banner)
  const topOffset = isMobile
    ? navbarHeight + bannerSize + (isIOSPWA ? 34 : 0)
    : bannerSize + 14;

  const time = getTimeOfDay(new Date());
  const title = randomT(`home.titles.${time}`);
  const placeholder = randomT(`home.search.placeholder`);
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);

  return (
    <>
    <ThinContainer>
      <div
        className={classNames(
          "space-y-16 text-center",
          showTitle ? "mt-44" : "mt-4",
        )}
      >
        {showTitle && (!isTV || search.length === 0) ? (
          <div className="relative z-10 mb-16">
            <HeroTitle className="mx-auto max-w-md">{title}</HeroTitle>
          </div>
        ) : null}

        <div
          className={classNames("relative z-30", rowWidth !== null && "left-1/2")}
          style={
            rowWidth !== null
              ? {
                  width: rowWidth,
                  marginLeft: `calc(-50vw + ${rowLeftInset}px)`,
                }
              : undefined
          }
        >
          <div className={compact ? "h-14" : "h-20"}>
            <Sticky
              topOffset={-topOffset}
              stickyStyle={{
                paddingTop: `${topOffset}px`,
              }}
              onFixedToggle={stickStateChanged}
              scrollElement="window"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <SearchBarInput
                    ref={inputRef}
                    onChange={setSearch}
                    value={search}
                    onUnFocus={setSearchUnFocus}
                    placeholder={placeholder ?? ""}
                    isSticky={showBg}
                    isInFeatured={isInFeatured}
                    compact={compact}
                  />
                </div>
                {!isInFeatured && (
                  <Link
                    to="/discover"
                    className={classNames(
                      "group relative flex items-center justify-center rounded-[28px] bg-search-background/50 hover:bg-search-background backdrop-blur-sm transition-[transform,background-color] duration-300 ease-spring hover:scale-105 active:scale-95 overflow-hidden",
                      compact ? "h-11" : "h-14",
                    )}
                  >
                    <div className="absolute inset-0 rounded-[28px] bg-[linear-gradient(90deg,#a855f7,#ec4899,#d946ef,#c084fc,#a855f7,#ec4899,#d946ef,#c084fc,#a855f7)] bg-[length:300%_100%] opacity-70 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-flow" />
                    <div className="absolute inset-[2px] rounded-[26px] bg-search-background transition-colors duration-300" />

                    <div className="relative flex items-center justify-center px-4 sm:px-5 h-full">
                      <Icon
                        icon={Icons.RISING_STAR}
                        className="text-search-icon group-hover:text-pink-400 transition-colors duration-300 text-xl group-hover:rotate-12"
                      />
                      <span className="max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-1 text-white font-bold text-sm tracking-wide bg-gradient-to-r from-pink-400 to-fuchsia-400 bg-clip-text group-hover:text-transparent transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden hidden sm:block">
                        Discover
                      </span>
                    </div>
                  </Link>
                )}
              </div>
            </Sticky>
          </div>
        </div>
      </div>
    </ThinContainer>
    {!isInFeatured && (!search || search.length === 0) && (
      <div className="mt-6 px-8">
        <GenreChips />
      </div>
    )}
    </>
  );
}
