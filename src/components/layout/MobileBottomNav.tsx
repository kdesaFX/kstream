import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { navControlSurface } from "@/components/layout/navControl";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useDiscoverStore } from "@/stores/discover";
import { usePreferencesStore } from "@/stores/preferences";
import { scrollToElement } from "@/utils/common/scroll";

type TabId =
  | "home"
  | "movies"
  | "tv"
  | "manga"
  | "bookmarks"
  | "search"
  | "settings";

/** Clear the fixed mobile header so Movies / TV / Manga tabs stay visible. */
const DISCOVER_SCROLL_OFFSET = 80;

function focusNavSearch() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => {
    document
      .querySelector<HTMLInputElement>('input[name="kstream-nav-search"]')
      ?.focus();
  }, 200);
}

function scrollToDiscover() {
  const target =
    document.getElementById("discover-nav") ??
    document.getElementById("discover-section");
  scrollToElement(target, {
    behavior: "smooth",
    offset: DISCOVER_SCROLL_OFFSET,
  });
}

function goToDiscoverCategory(
  category: "movies" | "tvshows" | "manga",
  pathname: string,
  navigate: ReturnType<typeof useNavigate>,
  setSelectedCategory: (c: "movies" | "tvshows" | "manga") => void,
) {
  setSelectedCategory(category);
  if (pathname !== "/") {
    navigate("/");
    window.setTimeout(scrollToDiscover, 300);
    // Lazy discover may mount after navigation — re-aim once nav exists.
    window.setTimeout(scrollToDiscover, 700);
  } else {
    scrollToDiscover();
    window.setTimeout(scrollToDiscover, 400);
  }
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
  const enableMangaDiscover = usePreferencesStore((s) => s.enableMangaDiscover);

  if (!isMobile || !shouldShowMobileBottomNav(location.pathname)) {
    return null;
  }

  const onHome = location.pathname === "/" || location.pathname === "/browse";
  const activeTab: TabId = (() => {
    if (location.pathname.startsWith("/settings")) return "settings";
    if (location.pathname.startsWith("/bookmarks")) return "bookmarks";
    if (location.pathname.startsWith("/browse")) return "search";
    if (onHome && selectedCategory === "tvshows") return "tv";
    if (onHome && selectedCategory === "manga") return "manga";
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
      icon: Icons.HOME,
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
        goToDiscoverCategory(
          "movies",
          location.pathname,
          navigate,
          setSelectedCategory,
        );
      },
    },
    {
      id: "tv",
      label: t("navigation.mobile.tv"),
      icon: Icons.TV,
      onClick: () => {
        goToDiscoverCategory(
          "tvshows",
          location.pathname,
          navigate,
          setSelectedCategory,
        );
      },
    },
    ...(enableMangaDiscover
      ? [
          {
            id: "manga" as const,
            label: t("navigation.mobile.manga"),
            icon: Icons.BOOK,
            onClick: () => {
              goToDiscoverCategory(
                "manga",
                location.pathname,
                navigate,
                setSelectedCategory,
              );
            },
          },
        ]
      : []),
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

  const tabCount = tabs.length;

  return (
    <nav
      aria-label={t("navigation.mobile.label")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[520] md:hidden px-5 sm:px-8"
    >
      <div
        className={classNames(
          // Content-sized pill — side padding on the nav leaves empty margins;
          // gap (not justify-between) keeps icon spacing tight and tappable.
          "pointer-events-auto mx-auto flex w-fit max-w-full items-center justify-center gap-0.5 rounded-full px-1.5 py-1",
          navControlSurface,
          "border border-white/10 shadow-[0_6px_24px_rgba(0,0,0,0.4)]",
          "mb-[max(0.5rem,env(safe-area-inset-bottom))]",
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
                "tabbable touch-manipulation flex shrink-0 items-center justify-center rounded-full",
                "transition-[transform,background-color,color] duration-150",
                // ~40–44px targets so taps register without hunting the icon.
                tabCount >= 7 ? "h-10 w-10" : "h-11 w-11",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/65 active:bg-white/10 active:text-white active:scale-95",
              )}
            >
              <Icon
                icon={tab.icon}
                className={
                  tabCount >= 7 ? "pointer-events-none text-[1rem]" : "pointer-events-none text-[1.1rem]"
                }
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export const MOBILE_BOTTOM_NAV_PADDING =
  "pb-[calc(4.75rem+env(safe-area-inset-bottom))]";
