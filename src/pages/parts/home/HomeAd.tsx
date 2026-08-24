import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { useIsMobile } from "@/hooks/useIsMobile";
import { conf } from "@/setup/config";
import { useAdsStore } from "@/stores/ads";

const LOAD_TIMEOUT_MS = 10000;
const PRIMARY_BANNER_GIF_SRC = "/ads/primary-banner.gif";
const DEFAULT_ADSTERRA_HOST = "https://www.highrevenueformat.com";

/**
 * Deferred (Tier B/C) — not wired yet; keys live in public/config.js comments:
 * - Home → Discover seam / Discover under tabs (728×90)
 * - Search under tabs (728×90 / 320×50)
 * - Watch/read history foot
 * - Manga details mid
 * - Global footer band
 * - 468×60 / 160×300 / native container units
 */

export type AdSlot =
  | "primary"
  | "secondary"
  | "secondaryRail"
  | "bookmarks"
  | "details";

function adScriptSrc(key: string): string {
  const base =
    conf().ADSTERRA_SCRIPT_HOST?.replace(/\/$/, "") || DEFAULT_ADSTERRA_HOST;
  return `${base}/${key}/invoke.js`;
}

/** Isolated iframe so multiple banners don't fight over window.atOptions. */
function loadAdsterraBanner(
  container: HTMLElement,
  key: string,
  width: number,
  height: number,
) {
  container.replaceChildren();
  const iframe = document.createElement("iframe");
  iframe.title = "Advertisement";
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = `width:${width}px;height:${height}px;border:0;overflow:hidden;display:block;max-width:100%;background:transparent;`;
  const src = adScriptSrc(key);
  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body><script>atOptions={key:${JSON.stringify(key)},format:"iframe",height:${height},width:${width},params:{}};</script><script src="${src}"></script></body></html>`;
  container.appendChild(iframe);
}

interface SlotConfig {
  key: string;
  width: number;
  height: number;
}

function AdSlotInner({ cfg }: { cfg: SlotConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adState, setAdState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const location = useLocation();
  const isWatchPage = location.pathname.startsWith("/media/");

  useEffect(() => {
    if (isWatchPage) {
      setAdState("failed");
      return;
    }
    const container = containerRef.current;
    if (!container || !cfg.key) return;

    setAdState("loading");
    loadAdsterraBanner(container, cfg.key, cfg.width, cfg.height);

    const update = () => {
      const frame = container.querySelector("iframe");
      if (!frame) return;
      try {
        const doc = frame.contentDocument;
        if (doc?.querySelector("iframe, img, a")) {
          setAdState("loaded");
        }
      } catch {
        // Cross-origin fill still counts as loaded once the shell iframe exists.
        setAdState("loaded");
      }
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      setAdState((s) => (s === "loading" ? "loaded" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      container.replaceChildren();
    };
  }, [cfg.key, cfg.width, cfg.height, isWatchPage]);

  if (adState === "failed") return null;

  const wrapperMaxWidth = cfg.width + 16;

  return (
    <div
      className="relative rounded-lg ring-1 ring-white/20 bg-black/30 transition-opacity duration-500"
      style={{
        maxWidth: `${wrapperMaxWidth}px`,
        width: "100%",
        opacity: adState === "loading" ? 0.6 : 1,
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
    <div className="relative mx-auto w-full max-w-[640px] rounded-[0.95rem] bg-black/35 ring-1 ring-white/15 transition-opacity duration-500 group">
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

export function HomeAd({ slot = "primary" }: { slot?: AdSlot } = {}) {
  const cfg = conf();
  const adsDisabled = useAdsStore((s) => s.adsDisabled);
  const { isMobile } = useIsMobile();

  const primarySlot = useMemo((): SlotConfig | null => {
    if (!cfg.ENABLE_HOME_AD) return null;
    if (isMobile && cfg.HOME_AD_MOBILE_ZONE_ID) {
      return { key: cfg.HOME_AD_MOBILE_ZONE_ID, width: 320, height: 50 };
    }
    if (cfg.HOME_AD_ZONE_ID) {
      return { key: cfg.HOME_AD_ZONE_ID, width: 728, height: 90 };
    }
    return null;
  }, [
    cfg.ENABLE_HOME_AD,
    cfg.HOME_AD_MOBILE_ZONE_ID,
    cfg.HOME_AD_ZONE_ID,
    isMobile,
  ]);

  if (adsDisabled) return null;

  if (slot === "primary") {
    const gifUrl =
      cfg.ENABLE_PRIMARY_BANNER_GIF && cfg.PRIMARY_BANNER_GIF_URL
        ? cfg.PRIMARY_BANNER_GIF_URL
        : null;
    if (!gifUrl && !primarySlot) return null;
    return (
      <div className="flex w-full flex-col items-center gap-3">
        {gifUrl && (
          <PrimaryGifBanner img={PRIMARY_BANNER_GIF_SRC} href={gifUrl} />
        )}
        {primarySlot && <AdSlotInner cfg={primarySlot} />}
      </div>
    );
  }

  if (slot === "bookmarks") {
    if (!cfg.ENABLE_BOOKMARKS_AD || !cfg.BOOKMARKS_AD_ZONE_ID) return null;
    return (
      <AdSlotInner
        cfg={{
          key: cfg.BOOKMARKS_AD_ZONE_ID,
          width: 300,
          height: 250,
        }}
      />
    );
  }

  if (slot === "details") {
    if (!cfg.ENABLE_DETAILS_AD || !cfg.DETAILS_AD_ZONE_ID) return null;
    return (
      <AdSlotInner
        cfg={{
          key: cfg.DETAILS_AD_ZONE_ID,
          width: 300,
          height: 250,
        }}
      />
    );
  }

  if (slot === "secondaryRail") {
    if (!cfg.ENABLE_SECONDARY_AD || !cfg.SECONDARY_AD_SKYSCRAPER_ZONE_ID)
      return null;
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

  // secondary — mid-page MREC
  if (!cfg.ENABLE_SECONDARY_AD || !cfg.SECONDARY_AD_ZONE_ID) return null;
  return (
    <AdSlotInner
      cfg={{
        key: cfg.SECONDARY_AD_ZONE_ID,
        width: 300,
        height: 250,
      }}
    />
  );
}
