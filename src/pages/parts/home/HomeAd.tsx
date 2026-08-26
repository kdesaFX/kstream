import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { useIsMobile } from "@/hooks/useIsMobile";
import { conf } from "@/setup/config";
import { useAdsStore, areAdsBlocked } from "@/stores/ads";

const LOAD_TIMEOUT_MS = 10000;
const PRIMARY_BANNER_GIF_SRC = "/ads/primary-banner.gif";
const DEFAULT_ADSTERRA_HOST = "https://www.highrevenueformat.com";

/**
 * Live Adsterra banner slots (no player / no popunder).
 * Flip ENABLE_* flags in public/config.js to pull any placement.
 */

export type AdSlot =
  | "primary"
  | "secondary"
  | "secondaryRail"
  | "bookmarks"
  | "history"
  | "details"
  | "discoverSeam"
  | "discover"
  | "search"
  | "mangaMid"
  | "footer"
  | "onboarding";

type SlotConfig = { key: string; width: number; height: number };

function leaderboardSlot(
  enabled: boolean,
  desktopId: string | null | undefined,
  mobileId: string | null | undefined,
  isMobile: boolean,
): SlotConfig | null {
  if (!enabled) return null;
  if (isMobile && mobileId) return { key: mobileId, width: 320, height: 50 };
  if (desktopId) return { key: desktopId, width: 728, height: 90 };
  if (mobileId) return { key: mobileId, width: 320, height: 50 };
  return null;
}

function mrecSlot(
  enabled: boolean,
  zoneId: string | null | undefined,
): SlotConfig | null {
  if (!enabled || !zoneId) return null;
  return { key: zoneId, width: 300, height: 250 };
}

function adScriptSrc(key: string): string {
  const base =
    conf().ADSTERRA_SCRIPT_HOST?.replace(/\/$/, "") || DEFAULT_ADSTERRA_HOST;
  return `${base}/${key}/invoke.js`;
}

declare global {
  interface Window {
    atOptions?: {
      key: string;
      format: string;
      height: number;
      width: number;
      params: Record<string, unknown>;
    };
  }
}

/**
 * Adsterra's invoke.js bails out when window !== top (anti-iframe).
 * Load on the real page, one at a time, so atOptions isn't clobbered.
 * Wait until this container gets an iframe (or timeout) before the next slot.
 */
let adLoadQueue: Promise<void> = Promise.resolve();

function loadAdsterraBanner(
  container: HTMLElement,
  key: string,
  width: number,
  height: number,
): Promise<void> {
  const job = () =>
    new Promise<void>((resolve) => {
      container.replaceChildren();
      window.atOptions = {
        key,
        format: "iframe",
        height,
        width,
        params: {},
      };

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = `${adScriptSrc(key)}?t=${Date.now()}`;
      script.dataset.cfasync = "false";
      // Keep order with the queue; async true lets the browser download without
      // blocking, but we still serialize via adLoadQueue.
      script.async = true;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const observer = new MutationObserver(() => {
        if (container.querySelector("iframe, img")) finish();
      });
      observer.observe(container, { childList: true, subtree: true });

      script.addEventListener("load", () => {
        // invoke.js starts an async XHR; poll briefly for the creative iframe.
        const started = Date.now();
        const poll = window.setInterval(() => {
          if (container.querySelector("iframe, img") || Date.now() - started > 4000) {
            window.clearInterval(poll);
            observer.disconnect();
            finish();
          }
        }, 100);
      });
      script.addEventListener("error", () => {
        observer.disconnect();
        finish();
      });

      container.appendChild(script);
      window.setTimeout(() => {
        observer.disconnect();
        finish();
      }, 6000);
    });

  const run = adLoadQueue.then(job, job);
  adLoadQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function AdSlotInner({ cfg }: { cfg: SlotConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adState, setAdState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const [readyToLoad, setReadyToLoad] = useState(false);
  const location = useLocation();
  const isWatchPage = location.pathname.startsWith("/media/");

  // Don't compete with LCP — wait until near view or idle.
  useEffect(() => {
    if (isWatchPage) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const markReady = () => {
      if (!cancelled) setReadyToLoad(true);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          markReady();
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(markReady, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(markReady, 1200);
    }

    return () => {
      cancelled = true;
      io.disconnect();
      if (
        idleId !== undefined &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isWatchPage]);

  useEffect(() => {
    if (isWatchPage) {
      setAdState("failed");
      return;
    }
    if (!readyToLoad) return;
    const container = containerRef.current;
    if (!container || !cfg.key) return;

    let cancelled = false;
    setAdState("loading");

    void loadAdsterraBanner(container, cfg.key, cfg.width, cfg.height).then(
      () => {
        if (!cancelled) setAdState("loaded");
      },
    );

    const observer = new MutationObserver(() => {
      if (cancelled) return;
      if (container.querySelector("iframe, img, a")) {
        setAdState("loaded");
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => {
      if (!cancelled) setAdState((s) => (s === "loading" ? "loaded" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [cfg.key, cfg.width, cfg.height, isWatchPage, readyToLoad]);

  if (adState === "failed") return null;

  const wrapperMaxWidth = cfg.width + 16;

  return (
    <div
      className="relative max-w-full rounded-lg ring-1 ring-white/20 bg-black/30 transition-opacity duration-500"
      style={{
        width: `${wrapperMaxWidth}px`,
        maxWidth: "100%",
        opacity: adState === "loading" || !readyToLoad ? 0.6 : 1,
      }}
    >
      <div className="rounded-lg overflow-hidden">
        <div className="px-2.5 pt-1.5 pb-0.5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 select-none">
            Advertisement
          </span>
        </div>
        <div className="px-2 pb-2 pt-0.5">
          <div
            ref={containerRef}
            className="flex items-center justify-center mx-auto overflow-hidden"
            style={{
              minHeight: `${cfg.height}px`,
              width: "100%",
              maxWidth: `${cfg.width}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

const PRIMARY_GIF_DISMISS_KEY = "primaryBannerGifDismissedUntil";
const PRIMARY_GIF_DISMISS_MS = 24 * 60 * 60 * 1000;

function PrimaryGifBanner({ img, href }: { img: string; href: string }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const until = Number(
      window.localStorage.getItem(PRIMARY_GIF_DISMISS_KEY) || "0",
    );
    return Date.now() < until;
  });

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(
        PRIMARY_GIF_DISMISS_KEY,
        String(Date.now() + PRIMARY_GIF_DISMISS_MS),
      );
    } catch {
      // ignore
    }
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,728px)] rounded-[0.95rem] bg-black/35 ring-1 ring-white/15 transition-opacity duration-500 group">
      <button
        onClick={dismiss}
        type="button"
        className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-mediaCard-hoverBackground transition-opacity duration-300 md:opacity-0 group-hover:opacity-100"
        aria-label="Dismiss ad"
      >
        <Icon
          className="text-xs font-semibold text-type-secondary"
          icon={Icons.X}
        />
      </button>
      <div className="overflow-hidden rounded-[0.95rem]">
        <div className="px-2.5 pt-1.5 pb-1">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 select-none">
            Advertisement
          </span>
        </div>
        <div className="px-2.5 pb-2.5 pt-0.5">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[0.8rem]"
          >
            <img
              src={img}
              alt="ad banner"
              className="block w-full rounded-[0.8rem] object-cover"
              style={{ aspectRatio: "7 / 2", maxHeight: "176px" }}
            />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Home hero ads: leaderboard (top-left) + MREC (top-right).
 * Corner / former-footer slot and the GIF are intentionally not shown here.
 */
export function HomeTopAds() {
  const cfg = conf();
  const adsDisabled = useAdsStore((s) => s.adsDisabled);
  const { isMobile } = useIsMobile();

  const primarySlot = useMemo(
    () =>
      leaderboardSlot(
        cfg.ENABLE_HOME_AD,
        cfg.HOME_AD_ZONE_ID,
        cfg.HOME_AD_MOBILE_ZONE_ID,
        isMobile,
      ),
    [
      cfg.ENABLE_HOME_AD,
      cfg.HOME_AD_MOBILE_ZONE_ID,
      cfg.HOME_AD_ZONE_ID,
      isMobile,
    ],
  );

  const secondarySlot = useMemo(
    () => mrecSlot(cfg.ENABLE_SECONDARY_AD, cfg.SECONDARY_AD_ZONE_ID),
    [cfg.ENABLE_SECONDARY_AD, cfg.SECONDARY_AD_ZONE_ID],
  );

  if (areAdsBlocked(adsDisabled)) return null;
  if (!primarySlot && !secondarySlot) return null;

  if (isMobile) {
    return (
      <div className="flex w-full flex-col items-center gap-4 px-4">
        {primarySlot && <AdSlotInner cfg={primarySlot} />}
        {secondarySlot && <AdSlotInner cfg={secondarySlot} />}
      </div>
    );
  }

  const useTwoColGrid = Boolean(primarySlot && secondarySlot);

  return (
    <div className="flex w-full justify-center px-4">
      <div
        className={
          useTwoColGrid
            ? "grid max-w-full items-start justify-items-center gap-4 grid-cols-1 min-[1060px]:grid-cols-[728px_300px]"
            : "flex max-w-full flex-col items-center gap-4"
        }
      >
        {primarySlot ? (
          <div className="w-full max-w-[728px] min-[1060px]:col-start-1 min-[1060px]:row-start-1 min-[1060px]:justify-self-stretch">
            <AdSlotInner cfg={primarySlot} />
          </div>
        ) : null}

        {secondarySlot ? (
          <div className="min-[1060px]:col-start-2 min-[1060px]:row-start-1">
            <AdSlotInner cfg={secondarySlot} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HomeAd({ slot = "primary" }: { slot?: AdSlot } = {}) {
  const cfg = conf();
  const adsDisabled = useAdsStore((s) => s.adsDisabled);
  const { isMobile } = useIsMobile();

  const primarySlot = useMemo(
    () =>
      leaderboardSlot(
        cfg.ENABLE_HOME_AD,
        cfg.HOME_AD_ZONE_ID,
        cfg.HOME_AD_MOBILE_ZONE_ID,
        isMobile,
      ),
    [
      cfg.ENABLE_HOME_AD,
      cfg.HOME_AD_MOBILE_ZONE_ID,
      cfg.HOME_AD_ZONE_ID,
      isMobile,
    ],
  );

  if (areAdsBlocked(adsDisabled)) return null;

  if (slot === "primary") {
    const gifUrl =
      cfg.ENABLE_PRIMARY_BANNER_GIF && cfg.PRIMARY_BANNER_GIF_URL
        ? cfg.PRIMARY_BANNER_GIF_URL
        : null;
    if (!gifUrl && !primarySlot) return null;
    return (
      <div className="flex max-w-full shrink-0 flex-col items-center gap-3">
        {gifUrl && (
          <PrimaryGifBanner img={PRIMARY_BANNER_GIF_SRC} href={gifUrl} />
        )}
        {primarySlot && <AdSlotInner cfg={primarySlot} />}
      </div>
    );
  }

  if (slot === "bookmarks" || slot === "history") {
    const mrec = mrecSlot(cfg.ENABLE_BOOKMARKS_AD, cfg.BOOKMARKS_AD_ZONE_ID);
    return mrec ? <AdSlotInner cfg={mrec} /> : null;
  }

  if (slot === "details") {
    const mrec = mrecSlot(cfg.ENABLE_DETAILS_AD, cfg.DETAILS_AD_ZONE_ID);
    return mrec ? <AdSlotInner cfg={mrec} /> : null;
  }

  if (slot === "mangaMid") {
    const mrec = mrecSlot(cfg.ENABLE_MANGA_MID_AD, cfg.MANGA_MID_AD_ZONE_ID);
    return mrec ? (
      <div className="flex w-full justify-center py-4">
        <AdSlotInner cfg={mrec} />
      </div>
    ) : null;
  }

  if (slot === "onboarding") {
    const mrec = mrecSlot(
      cfg.ENABLE_ONBOARDING_AD,
      cfg.ONBOARDING_AD_ZONE_ID,
    );
    return mrec ? (
      <div className="flex w-full justify-center pt-4">
        <AdSlotInner cfg={mrec} />
      </div>
    ) : null;
  }

  if (slot === "secondaryRail") {
    if (
      !cfg.ENABLE_SECONDARY_RAIL_AD ||
      !cfg.SECONDARY_AD_SKYSCRAPER_ZONE_ID
    ) {
      return null;
    }
    return (
      <AdSlotInner
        cfg={{
          key: cfg.SECONDARY_AD_SKYSCRAPER_ZONE_ID,
          width: 160,
          height: 600,
        }}
      />
    );
  }

  if (slot === "secondary") {
    if (!cfg.ENABLE_SECONDARY_AD || !cfg.SECONDARY_AD_ZONE_ID) return null;
    return (
      <div className="shrink-0">
        <AdSlotInner
          cfg={{
            key: cfg.SECONDARY_AD_ZONE_ID,
            width: 300,
            height: 250,
          }}
        />
      </div>
    );
  }

  if (slot === "footer") {
    if (!cfg.ENABLE_FOOTER_AD || !cfg.FOOTER_AD_ZONE_ID) return null;
    return (
      <div className="flex w-full justify-center px-4 pb-6">
        <AdSlotInner
          cfg={{
            key: cfg.FOOTER_AD_ZONE_ID,
            width: 468,
            height: 60,
          }}
        />
      </div>
    );
  }

  const banner =
    slot === "discoverSeam"
      ? leaderboardSlot(
          cfg.ENABLE_DISCOVER_SEAM_AD,
          cfg.DISCOVER_SEAM_AD_ZONE_ID,
          cfg.HOME_AD_MOBILE_ZONE_ID,
          isMobile,
        )
      : slot === "discover"
        ? leaderboardSlot(
            cfg.ENABLE_DISCOVER_AD,
            cfg.DISCOVER_AD_ZONE_ID,
            cfg.HOME_AD_MOBILE_ZONE_ID,
            isMobile,
          )
        : slot === "search"
          ? leaderboardSlot(
              cfg.ENABLE_SEARCH_AD,
              cfg.SEARCH_AD_ZONE_ID,
              cfg.SEARCH_AD_MOBILE_ZONE_ID,
              isMobile,
            )
          : null;

  if (!banner) return null;
  return (
    <div className="flex w-full justify-center px-4 py-4">
      <AdSlotInner cfg={banner} />
    </div>
  );
}
