import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
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
import { Transition } from "@/components/utils/Transition";
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
        className={`group flex items-center h-10 rounded-full transition-all duration-300 ease-out overflow-hidden ${
          isOpen
            ? "bg-type-link text-white shadow-lg pr-4"
            : "bg-pill-background bg-opacity-50 text-white hover:bg-pill-backgroundHover hover:bg-opacity-100 hover:pr-4 active:scale-105"
        }`}
        title="Edit Layout"
      >
        <div className="flex items-center justify-center w-10 h-10 shrink-0">
          <Icon icon={Icons.LAYOUT} className="text-xl" />
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

function NavSearchBar(props: { lightOverHero?: boolean }) {
  const { t: randomT } = useRandomTranslation();
  const [search, setSearch, setSearchUnFocus] = useSearchQuery();
  const { isMobile } = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);
  const placeholder = randomT(`home.search.placeholder`);

  return (
    <div className="pointer-events-auto w-full max-w-xl mx-2 ssm:mx-4">
      <SearchBarInput
        ref={inputRef}
        onChange={setSearch}
        value={search}
        onUnFocus={setSearchUnFocus}
        placeholder={placeholder ?? ""}
        isSticky={!props.lightOverHero}
        isInFeatured={props.lightOverHero}
        compact={isMobile}
        hideTooltip={isMobile}
      />
    </div>
  );
}

function MobileMenuLink(props: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
}) {
  const className =
    "w-full text-left tabbable cursor-pointer flex gap-3 items-center mx-2 my-0.5 p-2 rounded font-medium text-dropdown-text hover:text-white transition-colors duration-100";

  if (props.href) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={props.onClick}
      >
        {props.children}
        {props.badge}
      </a>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className={className}>
      {props.children}
      {props.badge}
    </button>
  );
}

function MobileActionsMenu(props: {
  openNotifications: () => void;
  openDownloadModal: () => void;
  showDownload: boolean;
  unreadCount: number | string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onWindowClick(evt: MouseEvent) {
      if ((evt.target as HTMLElement).closest(".is-mobile-menu")) return;
      setOpen(false);
    }
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  const shouldShowBadge =
    typeof props.unreadCount === "number"
      ? props.unreadCount > 0
      : props.unreadCount === "99+";

  return (
    <div className="relative is-mobile-menu lg:hidden">
      <a
        onClick={() => setOpen((v) => !v)}
        className="text-xl text-white tabbable rounded-full backdrop-blur-lg relative block"
        title="Menu"
      >
        <IconPatch icon={Icons.MENU} clickable downsized navigation />
        {shouldShowBadge ? (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] aspect-square flex items-center justify-center">
            {props.unreadCount}
          </span>
        ) : null}
      </a>
      <Transition animation="slide-down" show={open}>
        <div className="absolute left-0 top-full mt-3 z-50 w-56 rounded-xl bg-dropdown-altBackground py-2 shadow-lg ring-1 ring-white/10">
          <MobileMenuLink
            onClick={() => {
              setOpen(false);
              props.openNotifications();
            }}
            badge={
              shouldShowBadge ? (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full min-w-[16px] px-1 aspect-square flex items-center justify-center">
                  {props.unreadCount}
                </span>
              ) : null
            }
          >
            <Icon icon={Icons.BELL} className="text-xl" />
            Notifications
          </MobileMenuLink>
          {props.showDownload ? (
            <MobileMenuLink
              onClick={() => {
                setOpen(false);
                props.openDownloadModal();
              }}
            >
              <Icon icon={Icons.DOWNLOAD} className="text-xl" />
              Download app
            </MobileMenuLink>
          ) : null}
          <div className="mx-2 mt-1">
            <HomeLayoutCustomizerToggle />
          </div>
        </div>
      </Transition>
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
          <div className="px-3 ssm:px-7 py-5 relative z-[60] flex flex-1 items-center gap-2 ssm:gap-3">
            <div
              ref={leftRef}
              className="flex items-center space-x-1.5 ssm:space-x-3 pointer-events-auto shrink-0"
            >
              <Link
                className="block tabbable rounded-full text-xs ssm:text-base"
                to="/"
                onClick={() => window.scrollTo(0, 0)}
              >
                <BrandPill clickable header />
              </Link>
              <div className="hidden lg:flex items-center space-x-1.5 ssm:space-x-3">
                {showDownload ? (
                  <button
                    type="button"
                    onClick={() => openDownloadModal()}
                    className="tabbable rounded-full text-xs ssm:text-base"
                    title="Download app"
                    aria-label="Download Windows app"
                  >
                    <div className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 text-white backdrop-blur-md transition-[transform,background-color,border-color] hover:scale-105 hover:border-white/15 hover:bg-black/35 active:scale-95">
                      <Icon
                        icon={Icons.DOWNLOAD}
                        className="inline-flex text-lg leading-none [&>svg]:block"
                      />
                      <span className="font-semibold">Download</span>
                    </div>
                  </button>
                ) : null}
                <a
                  onClick={() => openNotifications()}
                  rel="noreferrer"
                  className="text-xl text-white tabbable rounded-full backdrop-blur-lg relative flex items-center justify-center"
                >
                  <IconPatch
                    icon={Icons.BELL}
                    clickable
                    downsized
                    navigation
                  />
                  {(() => {
                    const count = getUnreadCount();
                    const shouldShow =
                      typeof count === "number" ? count > 0 : count === "99+";
                    return shouldShow ? (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] aspect-square flex items-center justify-center">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </a>
              </div>
              <MobileActionsMenu
                openNotifications={openNotifications}
                openDownloadModal={openDownloadModal}
                showDownload={showDownload}
                unreadCount={getUnreadCount()}
              />
            </div>

            {props.showSearch ? (
              <div className="flex-1 flex justify-center min-w-0">
                <NavSearchBar lightOverHero={Boolean(props.clearBackground)} />
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div
              ref={rightRef}
              className="relative pointer-events-auto flex items-center gap-3 shrink-0"
            >
              <div className="hidden lg:block">
                <HomeLayoutCustomizerToggle />
              </div>
              <LinksDropdown>
                {loggedIn ? <UserAvatar withName /> : <NoUserAvatar />}
              </LinksDropdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
