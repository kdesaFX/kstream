import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { navControlSurface } from "@/components/layout/navControl";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useDiscoverStore } from "@/stores/discover";

type TabId = "home" | "movies" | "tv" | "bookmarks" | "search" | "settings";

function focusNavSearch() {
  window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => {
    document
      .querySelector<HTMLInputElement>('input[name="kstream-nav-search"]')
      ?.focus();
  }, 200);
}

function scrollToDiscover() {
  document
    .getElementById("discover-section")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function shouldShowMobileBottomNav(pathname: string): boolean {
  if (pathname.startsWith("/media/")) return false;
  if (pathname.startsWith("/manga/")) return false;
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/register")) return false;
  if (pathname.startsWith("/migration")) return false;
  if (pathname.startsWith("/onboarding")) return false;
  return true;
}

export function MobileBottomNav() {
  const { t } = useTranslation();
  const { isMobile } = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedCategory = useDiscoverStore((s) => s.selectedCategory);
  const setSelectedCategory = useDiscoverStore((s) => s.setSelectedCategory);

  if (!isMobile || !shouldShowMobileBottomNav(location.pathname)) {
    return null;
  }

  const onHome = location.pathname === "/" || location.pathname === "/browse";
  const activeTab: TabId = (() => {
    if (location.pathname.startsWith("/settings")) return "settings";
    if (location.pathname.startsWith("/bookmarks")) return "bookmarks";
    if (location.pathname.startsWith("/browse")) return "search";
    if (onHome && selectedCategory === "tvshows") return "tv";
    if (onHome && selectedCategory === "movies") return "movies";
    return "home";
  })();

  const tabs: Array<{
    id: TabId;
    label: string;
    icon: Icons;
    onClick: () => void;
  }> = [
    {
      id: "home",
      label: t("navigation.mobile.home"),
      icon: Icons.WEB,
      onClick: () => {
        setSelectedCategory("movies");
        navigate("/");
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
    {
      id: "movies",
      label: t("navigation.mobile.movies"),
      icon: Icons.CLAPPER_BOARD,
      onClick: () => {
        setSelectedCategory("movies");
        if (location.pathname !== "/") {
          navigate("/");
          window.setTimeout(scrollToDiscover, 300);
        } else {
          scrollToDiscover();
        }
      },
    },
    {
      id: "tv",
      label: t("navigation.mobile.tv"),
      icon: Icons.EPISODES,
      onClick: () => {
        setSelectedCategory("tvshows");
        if (location.pathname !== "/") {
          navigate("/");
          window.setTimeout(scrollToDiscover, 300);
        } else {
          scrollToDiscover();
        }
      },
    },
    {
      id: "bookmarks",
      label: t("navigation.mobile.bookmarks"),
      icon: Icons.BOOKMARK_OUTLINE,
      onClick: () => navigate("/bookmarks"),
    },
    {
      id: "search",
      label: t("navigation.mobile.search"),
      icon: Icons.SEARCH,
      onClick: () => {
        if (location.pathname.startsWith("/browse")) {
          focusNavSearch();
          return;
        }
        navigate("/browse/");
        focusNavSearch();
      },
    },
    {
      id: "settings",
      label: t("navigation.mobile.settings"),
      icon: Icons.SETTINGS,
      onClick: () => navigate("/settings"),
    },
  ];

  return (
    <nav
      aria-label={t("navigation.mobile.label")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[480] md:hidden"
    >
      <div
        className={classNames(
          "pointer-events-auto mx-auto mb-3 flex max-w-lg items-center justify-between gap-0.5 rounded-full px-2 py-2",
          navControlSurface,
          "border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]",
          "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        )}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              title={tab.label}
              onClick={tab.onClick}
              className={classNames(
                "tabbable flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-200",
                active
                  ? "bg-white/15 text-white scale-105"
                  : "text-white/70 hover:bg-white/10 hover:text-white active:scale-95",
              )}
            >
              <Icon icon={tab.icon} className="text-[1.15rem]" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export const MOBILE_BOTTOM_NAV_PADDING = "pb-[calc(5.5rem+env(safe-area-inset-bottom))]";
