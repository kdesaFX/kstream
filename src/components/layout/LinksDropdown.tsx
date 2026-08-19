import classNames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAsync } from "react-use";

import { getBackendMeta } from "@/backend/accounts/meta";
import { getRoomStatuses } from "@/backend/player/status";
import { UserAvatar } from "@/components/Avatar";
import { Icon, Icons } from "@/components/Icon";
import { navControlSurface } from "@/components/layout/navControl";
import { Spinner } from "@/components/layout/Spinner";
import { useDesktopAppSettingsModal } from "@/components/overlays/desktopAppSettings";
import { Transition } from "@/components/utils/Transition";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuthStore } from "@/stores/auth";

function Divider() {
  return <hr className="border-0 w-full h-px bg-dropdown-border" />;
}

function GoToLink(props: {
  children: React.ReactNode;
  href?: string;
  className?: string;
  onClick?: () => void;
}) {
  const navigate = useNavigate();

  const goTo = (href: string) => {
    if (href.startsWith("http")) {
      window.open(href, "_blank");
    } else {
      window.scrollTo(0, 0);
      navigate(href);
    }
  };

  return (
    <a
      tabIndex={0}
      href={props.href}
      onClick={(evt) => {
        evt.preventDefault();
        if (props.href) goTo(props.href);
        else props.onClick?.();
      }}
      className={props.className}
    >
      {props.children}
    </a>
  );
}

function DropdownLink(props: {
  children: React.ReactNode;
  href?: string;
  icon?: Icons;
  highlight?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <GoToLink
      onClick={props.onClick}
      href={props.href}
      className={classNames(
        "tabbable cursor-pointer flex gap-3 items-center m-3 p-1 rounded font-medium transition-colors duration-100",
        props.highlight
          ? "text-dropdown-highlight hover:text-dropdown-highlightHover"
          : "text-dropdown-text hover:text-white",
        props.className,
      )}
    >
      {props.icon ? <Icon icon={props.icon} className="text-xl" /> : null}
      {props.children}
    </GoToLink>
  );
}

function WatchPartyInputLink() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backendUrl = useBackendUrl();
  const account = useAuthStore((s) => s.account);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !backendUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await getRoomStatuses(
        backendUrl,
        account,
        code.trim().toUpperCase(),
      );
      const users = Object.values(response.users);

      if (users.length === 0) {
        setError(t("watchParty.emptyRoom"));
        return;
      }

      const hostUser = users.find((user) => user[0].isHost)?.[0];
      if (!hostUser) {
        setError(t("watchParty.noHost"));
        return;
      }

      const { content } = hostUser;
      const contentType =
        typeof content?.type === "string" ? content.type.toLowerCase() : "";

      let targetUrl = "";
      if (contentType === "tv show" && content.seasonId && content.episodeId) {
        targetUrl = `/media/tmdb-tv-${content.tmdbId}/${content.seasonId}/${content.episodeId}`;
      } else {
        targetUrl = `/media/tmdb-movie-${content.tmdbId}`;
      }

      const url = new URL(targetUrl, window.location.origin);
      url.searchParams.set("watchparty", code.trim().toUpperCase());

      navigate(url.pathname + url.search);
      setCode("");
    } catch (err) {
      console.error("Failed to fetch room data:", err);
      setError(t("watchParty.invalidRoom"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={classNames(
        "m-3 p-1 rounded font-medium transition-colors duration-100 group",
        "text-dropdown-text hover:text-white",
        isFocused ? "bg-dropdown-contentBackground" : "",
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Icon icon={Icons.WATCH_PARTY} className="text-xl" />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t("watchParty.joinParty")}
            className="bg-transparent border-none outline-none w-full text-base placeholder:text-dropdown-text group-hover:placeholder:text-white"
            maxLength={10}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={classNames(
              "p-1 rounded hover:bg-dropdown-contentBackground transition-colors",
              isLoading && "opacity-50 cursor-not-allowed",
              !code.trim() && "opacity-0 pointer-events-none",
            )}
            disabled={!code.trim() || isLoading}
          >
            {isLoading ? (
              <Spinner className="w-5 h-5" />
            ) : (
              <Icon
                icon={Icons.ARROW_RIGHT}
                className="text-xl transition-opacity duration-200"
              />
            )}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 px-1 ml-8">{error}</p>}
      </div>
    </form>
  );
}

export function LinksDropdown(props: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const deviceName = useAuthStore((s) => s.account?.deviceName);
  const nickname = useAuthStore((s) => s.account?.nickname);
  const { logout } = useAuth();
  const backendUrl = useBackendUrl();

  // Check backend compatibility for watch party
  const backendMeta = useAsync(async () => {
    if (!backendUrl) return;
    return getBackendMeta(backendUrl);
  }, [backendUrl]);

  const backendSupportsWatchParty = backendMeta?.value?.version
    ? backendMeta.value.version >= "2.0.1"
    : false;

  useEffect(() => {
    function onWindowClick(evt: MouseEvent) {
      if ((evt.target as HTMLElement).closest(".is-dropdown")) return;
      setOpen(false);
    }

    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((s) => !s);
  }, []);

  const isDesktopApp = useIsDesktopApp();
  const { openDesktopAppSettings } = useDesktopAppSettingsModal();
  const { isMobile } = useIsMobile();

  return (
    <div className="relative is-dropdown">
      <div
        className={classNames(
          "cursor-pointer tabbable rounded-full flex text-white items-center overflow-hidden transition-all duration-100 hover:scale-105",
          navControlSurface,
          "hover:bg-pill-backgroundHover/80",
          isMobile
            ? "h-10 min-w-[2.75rem] justify-center gap-0 px-3"
            : "h-[2.67rem] min-w-[3.25rem] gap-1.5 px-3.5",
          open ? "bg-pill-backgroundHover/80" : "",
        )}
        tabIndex={0}
        onClick={toggleOpen}
        onKeyUp={(evt) => evt.key === "Enter" && toggleOpen()}
      >
        {props.children}
        {!isMobile ? (
          <Icon
            className={classNames(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center leading-none transition-transform duration-100 [&>svg]:block [&>svg]:h-5 [&>svg]:w-5",
              open ? "rotate-180" : "",
            )}
            icon={Icons.CHEVRON_DOWN}
          />
        ) : null}
      </div>
      <Transition animation="slide-down" show={open}>
        <div className="rounded-xl absolute w-64 bg-dropdown-altBackground top-full mt-3 right-0">
          {deviceName ? (
            <>
              <DropdownLink className="text-white" href="/settings">
                <UserAvatar />
                {nickname}
              </DropdownLink>
              <Divider />
            </>
          ) : null}
          <DropdownLink href="/settings" icon={Icons.SETTINGS}>
            {t("navigation.menu.settings")}
          </DropdownLink>
          {isDesktopApp && (
            <DropdownLink
              onClick={() => {
                setOpen(false);
                openDesktopAppSettings();
              }}
              icon={Icons.GEAR}
            >
              {t("navigation.menu.desktop")}
            </DropdownLink>
          )}
          <DropdownLink href="/watch-history" icon={Icons.CLOCK}>
            {t("home.watchHistory.sectionTitle")}
          </DropdownLink>
          <DropdownLink href="/read-history" icon={Icons.BOOKMARK}>
            {t("home.readHistory.sectionTitle")}
          </DropdownLink>
          <DropdownLink href="/bookmarks" icon={Icons.BOOKMARK}>
            {t("navigation.menu.savedTitles")}
          </DropdownLink>
          <DropdownLink href="/algorithm" icon={Icons.WAND}>
            {t("navigation.menu.algorithm")}
          </DropdownLink>
          <DropdownLink href="/about" icon={Icons.CIRCLE_QUESTION}>
            {t("navigation.menu.about")}
          </DropdownLink>
          {backendSupportsWatchParty && <WatchPartyInputLink />}
          {deviceName ? (
            <DropdownLink
              className="!text-type-danger opacity-75 hover:opacity-100"
              icon={Icons.LOGOUT}
              onClick={logout}
            >
              {t("navigation.menu.logout")}
            </DropdownLink>
          ) : null}
        </div>
      </Transition>
    </div>
  );
}
