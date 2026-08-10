import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMeasure } from "react-use";
import { Link } from "react-router-dom";

import { NoUserAvatar, UserAvatar } from "@/components/Avatar";
import { IconPatch } from "@/components/buttons/IconPatch";
import { SearchBarInput } from "@/components/form/SearchBar";
import { Icon, Icons } from "@/components/Icon";
import { LinksDropdown } from "@/components/layout/LinksDropdown";
import { useDownloadModal } from "@/components/overlays/downloadModal";
import { useNotifications } from "@/components/overlays/notificationsModal";
import { useSlashFocus } from "@/components/player/hooks/useSlashFocus";
import { Lightbar } from "@/components/utils/Lightbar";
import { useAuth } from "@/hooks/auth/useAuth";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { BlurEllipsis } from "@/pages/layouts/SubPageLayout";
import { HomeSectionCustomizer } from "@/pages/parts/home/HomeSectionCustomizer";
import { useBannerSize } from "@/stores/banner";
import { useNavLayoutStore } from "@/stores/navLayout";
import { usePreferencesStore } from "@/stores/preferences";

import { BrandPill } from "./BrandPill";

function HomeLayoutCustomizerToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const path = window.location.pathname;

  // Home + browse (search results) share the home layout customizer
  if (path !== "/" && !path.startsWith("/browse")) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center h-10 md:h-[2.67rem] rounded-full transition-all duration-300 ease-out overflow-hidden ${
          isOpen
            ? "bg-type-link text-white shadow-lg pr-4"
            : "bg-pill-background bg-opacity-50 text-white hover:bg-pill-backgroundHover hover:bg-opacity-100 hover:pr-4 active:scale-105"
        }`}
        title="Edit Layout"
      >
        <div className="flex items-center justify-center w-10 h-10 md:w-[2.67rem] md:h-[2.67rem] shrink-0">
          <Icon icon={Icons.LAYOUT} className="text-xl md:text-2xl" />
        </div>
        <span
          className={`font-medium text-sm whitespace-nowrap transition-all duration-300 ease-out ${
            isOpen
              ? "max-w-[100px] opacity-100"
              : "max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100"
          }`}
        >
          Layout
        </span>
      </button>
      <HomeSectionCustomizer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}

function NavSearchBar(props: { lightOverHero?: boolean; className?: string }) {
  const { t } = useTranslation();
  const { t: randomT } = useRandomTranslation();
  const [search, setSearch, setSearchUnFocus] = useSearchQuery();
  const { isMobile } = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);
  // Short copy on mobile so the full placeholder fits in the narrower field.
  const placeholder = isMobile
    ? t("home.search.placeholder.defaultMobile")
    : randomT("home.search.placeholder");

  return (
    <div
      className={classNames(
        "pointer-events-auto w-full max-w-2xl md:max-w-3xl",
        props.className,
      )}
    >
      <SearchBarInput
        ref={inputRef}
        onChange={setSearch}
        value={search}
        onUnFocus={setSearchUnFocus}
        placeholder={placeholder ?? ""}
        isSticky={!props.lightOverHero}
        isInFeatured={props.lightOverHero}
        compact={isMobile}
        large={!isMobile}
        hideTooltip={isMobile}
      />
    </div>
  );
}

export interface NavigationProps {
  bg?: boolean;
  noLightbar?: boolean;
  doBackground?: boolean;
  clearBackground?: boolean;
  showSearch?: boolean;
}

export function Navigation(props: NavigationProps) {
  const bannerHeight = useBannerSize();
  const { loggedIn } = useAuth();
  const { isMobile } = useIsMobile();
  const [scrollPosition, setScrollPosition] = useState(0);
  const { openNotifications, getUnreadCount } = useNotifications();
  const { openDownloadModal } = useDownloadModal();
  const isDesktopApp = useIsDesktopApp();
  const showDownload = !isDesktopApp;
  const [leftRef, { width: leftWidth }] = useMeasure<HTMLDivElement>();
  const [rightRef, { width: rightWidth }] = useMeasure<HTMLDivElement>();
  const setLeftWidth = useNavLayoutStore((s) => s.setLeftWidth);
  const setRightWidth = useNavLayoutStore((s) => s.setRightWidth);

  useEffect(() => {
    setLeftWidth(leftWidth);
  }, [leftWidth, setLeftWidth]);

  useEffect(() => {
    setRightWidth(rightWidth);
  }, [rightWidth, setRightWidth]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const getMaskLength = () => {
    const maxScroll = 300;
    const minLength = 100;
    const maxLength = 180;
    const scrollFactor = Math.min(scrollPosition, maxScroll) / maxScroll;
    return minLength + (maxLength - minLength) * (1 - scrollFactor);
  };

  const enableLowPerformanceMode = usePreferencesStore(
    (s) => s.enableLowPerformanceMode,
  );

  return (
    <>
      {/* lightbar */}
      {!props.noLightbar ? (
        <div
          className="absolute inset-x-0 top-0 flex h-[88px] items-center justify-center"
          style={{
            top: `${bannerHeight}px`,
          }}
        >
          <div className="absolute inset-x-0 -mt-[22%] flex items-center sm:mt-0">
            <Lightbar noParticles={enableLowPerformanceMode} />
          </div>
        </div>
      ) : null}

      {/* backgrounds - these are seperate because of z-index issues */}
      <div
        className="top-content fixed z-[20] pointer-events-none left-0 right-0 top-0 min-h-[150px]"
        style={{
          top: `${bannerHeight}px`,
        }}
      >
        <div
          className={classNames(
            "fixed left-0 right-0 top-0 flex items-center",
            "transition-[background-color,backdrop-filter] duration-300 ease-in-out",
            "bg-transparent",
          )}
        >
          {props.doBackground ? (
            <div className="absolute w-full h-full inset-0 overflow-hidden">
              <BlurEllipsis positionClass="absolute" />
            </div>
          ) : null}
          <div className="opacity-0 absolute inset-0 block h-20 pointer-events-auto" />
          <div
            className={classNames(
              "transition-[background-color,backdrop-filter,opacity] duration-300 ease-in-out",
              props.bg ? "opacity-100" : "opacity-0",
              "absolute inset-0 block h-[11rem]",
              // Stay transparent/clean — light blur only once scrolled, never a solid slab
              props.clearBackground
                ? "bg-transparent"
                : "backdrop-blur-[6px] bg-black/15",
            )}
            style={{
              maskImage: `linear-gradient(
                to bottom,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 1) calc(100% - ${getMaskLength()}px),
                rgba(0, 0, 0, 0) 100%
              )`,
              WebkitMaskImage: `linear-gradient(
                to bottom,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 1) calc(100% - ${getMaskLength()}px),
                rgba(0, 0, 0, 0) 100%
              )`,
            }}
          />
        </div>
      </div>

      {/* content */}
      <div
        className="top-content fixed pointer-events-none left-0 right-0 z-[500] top-0 min-h-[150px]"
        style={{
          top: `${bannerHeight}px`,
        }}
      >
        <div className={classNames("fixed left-0 right-0 flex items-center")}>
          <div className="px-2 ssm:px-7 py-3 md:py-5 relative z-[60] flex flex-1 items-center gap-1.5 ssm:gap-2 md:gap-3">
            {/*
              Desktop: search is absolutely viewport-centered.
              Mobile: search stays in the flex row so everything shares one baseline.
            */}
            {props.showSearch ? (
              <div
                className="pointer-events-none absolute top-1/2 left-1/2 z-[55] hidden w-full -translate-x-1/2 -translate-y-1/2 md:block"
                style={{
                  width: `min(48rem, calc(100% - ${
                    Math.max(leftWidth, rightWidth, 72) * 2 + 32
                  }px))`,
                }}
              >
                <NavSearchBar
                  lightOverHero={Boolean(props.clearBackground)}
                />
              </div>
            ) : null}

            <div
              ref={leftRef}
              className="relative z-[60] flex items-center gap-1.5 ssm:gap-2 md:gap-3 pointer-events-auto shrink-0"
            >
              <Link
                className="block tabbable rounded-full text-xs ssm:text-base"
                to="/"
                onClick={() => window.scrollTo(0, 0)}
              >
                <BrandPill clickable header />
              </Link>
              <div className="flex items-center gap-1.5 ssm:gap-2 md:gap-3">
                {showDownload ? (
                  <button
                    type="button"
                    onClick={() => openDownloadModal()}
                    className="hidden lg:block tabbable rounded-full text-base"
                    title="Download app"
                    aria-label="Download Windows app"
                  >
                    <div className="flex h-[2.67rem] items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 text-white backdrop-blur-md transition-[transform,background-color,border-color] hover:scale-105 hover:border-white/15 hover:bg-black/35 active:scale-95">
                      <Icon
                        icon={Icons.DOWNLOAD}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-5 [&>svg]:w-5"
                      />
                      <span className="font-semibold text-base">Download</span>
                    </div>
                  </button>
                ) : null}
                <a
                  onClick={() => openNotifications()}
                  rel="noreferrer"
                  className="text-white tabbable rounded-full backdrop-blur-lg relative flex h-10 w-10 md:h-[2.67rem] md:w-[2.67rem] shrink-0 items-center justify-center"
                >
                  <IconPatch
                    icon={Icons.BELL}
                    clickable
                    navigation
                    className={
                      isMobile
                        ? "[&>div]:!h-10 [&>div]:!w-10 [&>div]:!text-[1.25rem] [&>div>span]:!text-[1.25rem] [&>div>span>svg]:!h-5 [&>div>span>svg]:!w-5"
                        : "[&>div]:!h-[2.67rem] [&>div]:!w-[2.67rem] [&>div]:!text-[1.25rem] [&>div>span]:!text-[1.25rem] [&>div>span>svg]:!h-5 [&>div>span>svg]:!w-5"
                    }
                  />
                  {(() => {
                    const count = getUnreadCount();
                    const shouldShow =
                      typeof count === "number" ? count > 0 : count === "99+";
                    return shouldShow ? (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] aspect-square flex items-center justify-center">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </a>
              </div>
            </div>

            {props.showSearch ? (
              <>
                <div className="relative z-[55] min-w-0 flex-1 pointer-events-auto md:hidden">
                  <NavSearchBar
                    lightOverHero={Boolean(props.clearBackground)}
                  />
                </div>
                <div className="hidden min-w-0 flex-1 md:block" aria-hidden />
              </>
            ) : (
              <div className="flex-1 min-w-0" aria-hidden />
            )}

            <div
              ref={rightRef}
              className="relative z-[60] pointer-events-auto flex items-center gap-2 md:gap-3 shrink-0"
            >
              <div className="hidden lg:block">
                <HomeLayoutCustomizerToggle />
              </div>
              <LinksDropdown>
                {loggedIn ? (
                  <UserAvatar
                    withName={!isMobile}
                    sizeClass="w-5 h-5 md:w-5 md:h-5"
                    iconClass="text-xs md:text-sm"
                  />
                ) : (
                  <NoUserAvatar iconClass="text-lg md:text-lg" />
                )}
              </LinksDropdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
