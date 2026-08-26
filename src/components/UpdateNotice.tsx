import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";
import { useBannerSize } from "@/stores/banner";
import { clearStaleChunkReloadGuard } from "@/utils/staleChunkReload";

export function UpdateNotice() {
  const { t } = useTranslation();
  const location = useLocation();
  const { updateAvailable, dismiss } = useAppUpdateCheck();
  const [entered, setEntered] = useState(false);
  const bannerHeight = useBannerSize();

  // While watching, drop in from the top so it stays clear of player chrome.
  // Everywhere else (home, etc.), slide in from the left under the brand/bell row.
  const isWatching = location.pathname.startsWith("/media/");

  useEffect(() => {
    if (!updateAvailable) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [updateAvailable, isWatching]);

  const handleDismiss = () => {
    setEntered(false);
    setTimeout(dismiss, 250);
  };

  const refresh = () => {
    clearStaleChunkReloadGuard();
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.href = url.toString();
  };

  if (!updateAvailable) return null;

  const shellClass = isWatching
    ? "pointer-events-none fixed inset-x-0 z-[200] flex justify-center px-4"
    : "pointer-events-none fixed left-0 z-[200] flex justify-start pl-[max(0.75rem,env(safe-area-inset-left))] ssm:pl-[max(1.75rem,env(safe-area-inset-left))] pr-4";

  const shellStyle = isWatching
    ? {
        top: `max(1.25rem, calc(${bannerHeight}px + env(safe-area-inset-top)))`,
      }
    : {
        // Same band as the header brand/bell row (py-5 + control height).
        top: `calc(${bannerHeight}px + env(safe-area-inset-top) + 4.75rem)`,
      };

  const cardMotion = isWatching
    ? entered
      ? "translate-y-0 opacity-100"
      : "-translate-y-4 opacity-0"
    : entered
      ? "translate-x-0 opacity-100"
      : "-translate-x-full opacity-0";

  return (
    <div className={shellClass} style={shellStyle}>
      <div
        className={[
          "pointer-events-auto group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10",
          "bg-background-main/90 px-4 py-3 pr-2 shadow-soft-lg backdrop-blur-xl ring-1 ring-white/5",
          "transition-[transform,opacity] duration-300 ease-out-quint",
          "max-w-[min(30rem,calc(100vw-2rem))]",
          cardMotion,
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-progress-filled/20 via-transparent to-transparent" />

        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-progress-filled to-buttons-purple text-white shadow-soft-sm">
          <span className="absolute inset-0 rounded-xl bg-progress-filled/40 animate-ping" />
          <Icon icon={Icons.RELOAD} className="relative text-lg" />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">
            {t("updateNotice.title")}
          </p>
          <p className="text-xs leading-snug text-white/60">
            {t("updateNotice.description")}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="relative flex-shrink-0 rounded-lg bg-buttons-purple px-3 py-1.5 text-xs font-bold text-white transition-[background-color,transform] duration-150 ease-spring hover:-translate-y-0.5 hover:bg-buttons-purpleHover active:translate-y-0"
        >
          {t("updateNotice.refresh")}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("updateNotice.dismiss")}
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors duration-150 hover:bg-white/5 hover:text-white/80"
        >
          <Icon icon={Icons.X} className="text-base" />
        </button>
      </div>
    </div>
  );
}
