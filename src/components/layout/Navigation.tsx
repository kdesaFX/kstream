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
import {
  navControlHover,
  navControlSurface,
} from "@/components/layout/navControl";
import { useDownloadModal } from "@/components/overlays/downloadModal";
import { useOptimizeModal } from "@/components/overlays/optimizeModal";
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

function HomeOptimizeToggle() {
  const { t } = useTranslation();
  const { openOptimizeModal } = useOptimizeModal();

  return (
    <button
      type="button"
      onClick={() => openOptimizeModal()}
      className={`group flex items-center h-10 md:h-[2.67rem] rounded-full transition-all duration-300 ease-out overflow-hidden ${navControlSurface} text-white hover:bg-pill-backgroundHover/80 hover:pr-4 active:scale-105`}
      title={t("settings.optimize.button")}
    >
      <div className="flex items-center justify-center w-10 h-10 md:w-[2.67rem] md:h-[2.67rem] shrink-0">
        <Icon
          icon={Icons.TACHOMETER}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-5 [&>svg]:w-5"
        />
      </div>
      <span className="font-medium text-sm whitespace-nowrap transition-all duration-300 ease-out max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100">
        {t("settings.optimize.button")}
      </span>
    </button>
  );
}

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
            : `${navControlSurface} text-white hover:bg-pill-backgroundHover/80 hover:pr-4 active:scale-105`
        }`}
        title="Edit Layout"
      >
        <div className="flex items-center justify-center w-10 h-10 md:w-[2.67rem] md:h-[2.67rem] shrink-0">
          <Icon
            icon={Icons.LAYOUT}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-5 [&>svg]:w-5"
          />
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
      <HomeSectionCustomizer isOpen={isOpen} onClose={() => setIsOpen(false)} />
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
        "pointer-events-auto w-full min-w-0 max-w-[31.5rem] md:max-w-[36rem]",
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
      {/* lightbar — keep overflow visible so the glow isn't clipped to the nav strip */}
      {!props.noLightbar ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[15] overflow-visible"
          style={{
            top: `${bannerHeight}px`,
          }}
        >
          <div className="absolute inset-x-0 top-0 flex items-center overflow-visible sm:mt-0 -mt-[12%]">
            <Lightbar noParticles={enableLowPerformanceMode} />
          </div>
        </div>
      ) : null}

      {/* backgrounds - these are seperate because of z-index issues */}
      <div
        className="top-content fixed z-[20] pointer-events-none left-0 right-0 top-0 min-h-0 md:min-h-[150px]"
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
          <div className="opacity-0 absolute inset-0 block h-14 md:h-20 pointer-events-auto" />
          <div
            className={classNames(
              "transition-[background-color,backdrop-filter,opacity] duration-300 ease-in-out",
              props.bg ? "opacity-100" : "opacity-0",
              "absolute inset-0 block h-16 md:h-[11rem]",
              // Desktop: transparent over hero, light blur once scrolled.
              // Mobile: denser frosted bar so content can't read through the nav.
              props.clearBackground
                ? "bg-transparent"
                : isMobile
                  ? "backdrop-blur-xl bg-background-main/90"
                  : "backdrop-blur-[6px] bg-black/15",
            )}
            style={
              isMobile
                ? undefined
                : {
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
                  }
            }
          />
        </div>
      </div>

      {/* content */}
      <div
        className="top-content fixed pointer-events-none left-0 right-0 z-[500] top-0 min-h-0 md:min-h-[150px]"
        style={{
          top: `${bannerHeight}px`,
        }}
      >
        <div className="fixed left-0 right-0">
          <div className="relative z-[60] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 ssm:gap-x-2 md:gap-x-3 px-2.5 ssm:px-7 py-2 md:py-5">
            <div
              ref={leftRef}
              className="flex items-center gap-1 ssm:gap-2 md:gap-3 pointer-events-auto shrink-0 min-w-0"
            >
              <Link
                className="block tabbable rounded-full text-xs ssm:text-base shrink-0"
                to="/"
                onClick={() => window.scrollTo(0, 0)}
              >
                <BrandPill clickable header />
              </Link>
              <div className="flex items-center gap-1.5 ssm:gap-2 md:gap-3 shrink-0">
                {showDownload ? (
                  <button
                    type="button"
                    onClick={() => openDownloadModal()}
                    className="hidden lg:block tabbable rounded-full text-base shrink-0"
                    title="Download app"
                    aria-label="Download Windows app"
                  >
                    <div
                      className={classNames(
                        "flex h-10 md:h-[2.67rem] items-center gap-2 rounded-full text-white shrink-0",
                        "px-2.5 xl:px-3.5",
                        navControlSurface,
                        navControlHover,
                      )}
                    >
                      <Icon
                        icon={Icons.DOWNLOAD}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-5 [&>svg]:w-5"
                      />
                      <span className="hidden xl:inline font-semibold text-base whitespace-nowrap">
                        Download
                      </span>
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
              <div className="pointer-events-auto z-[55] flex min-w-0 justify-center px-0.5 ssm:px-1">
                <NavSearchBar
                  lightOverHero={Boolean(props.clearBackground)}
                  className="!max-w-[36rem] w-full min-w-0"
                />
              </div>
            ) : (
              <div aria-hidden />
            )}

            <div
              ref={rightRef}
              className="pointer-events-auto flex items-center justify-end gap-2 md:gap-3 shrink-0 min-w-0"
            >
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <HomeOptimizeToggle />
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
                  <NoUserAvatar iconClass="inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none [&>svg]:block [&>svg]:h-5 [&>svg]:w-5" />
                )}
              </LinksDropdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
