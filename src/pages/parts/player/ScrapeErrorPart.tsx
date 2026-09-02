import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import {
  isExtensionActiveCached,
  sendPage,
} from "@/backend/extension/messaging";
import { Button } from "@/components/buttons/Button";
import { Icons } from "@/components/Icon";
import { useModal } from "@/components/overlays/Modal";
import { PlayerStageMessage } from "@/components/player/internals/PlayerStageOverlay";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { conf } from "@/setup/config";
import { useOnboardingStore } from "@/stores/onboarding";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { getExtensionState } from "@/utils/browser/extension";
import type { ExtensionStatus } from "@/utils/browser/extension";
import { isMobileOnboardingClient } from "@/utils/hosting/onboarding";

import { ErrorCardInModal } from "../errors/ErrorCard";

export interface ScrapeErrorPartProps {
  data: {
    sources: Record<string, ScrapingSegment>;
    sourceOrder: ScrapingItems[];
  };
  onRetry?: () => void;
}

export function ScrapeErrorPart(props: ScrapeErrorPartProps) {
  const { t } = useTranslation();
  const modal = useModal("error");
  const location = useLocation();
  const navigate = useNavigate();
  const meta = usePlayerStore((s) => s.meta);
  const [extensionState, setExtensionState] =
    useState<ExtensionStatus>("unknown");
  const setOnboardingCompleted = useOnboardingStore((s) => s.setCompleted);
  const febboxKey = usePreferencesStore((s) => s.febboxKey);

  const mediaTitle =
    meta?.type === "show" && meta.episode
      ? `${meta.title} · S${meta.season?.number ?? 1}E${meta.episode.number}`
      : meta?.title;

  const error = useMemo(() => {
    const data = props.data;
    const lines: string[] = [];
    lines.push(`=== SCRAPE FAILURE ===`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`URL: ${location.pathname}${location.search}`);
    lines.push(`Online: ${navigator.onLine}`);
    lines.push(`Extension state: ${extensionState}`);
    lines.push(`Extension active (cached): ${isExtensionActiveCached()}`);
    lines.push(`Has febbox key: ${!!febboxKey}`);
    lines.push(`User Agent: ${navigator.userAgent}`);
    lines.push("");
    lines.push(`=== SOURCE ORDER (${data.sourceOrder.length}) ===`);
    data.sourceOrder.forEach((s, i) => {
      const childCount = s.children?.length ?? 0;
      lines.push(
        `  ${i + 1}. ${s.id}${childCount > 0 ? ` (+${childCount} embeds)` : ""}`,
      );
    });
    lines.push("");
    lines.push(`=== SOURCE RESULTS (${Object.keys(data.sources).length}) ===`);
    Object.values(data.sources).forEach((v) => {
      lines.push(`--- ${v.id} ---`);
      lines.push(`Status: ${v.status}`);
      if (v.percentage !== undefined) lines.push(`Progress: ${v.percentage}%`);
      if (v.reason) lines.push(`Reason: ${v.reason}`);
      if (v.error) {
        if (v.error instanceof Error) {
          lines.push(`Error: ${v.error.name}: ${v.error.message}`);
          if (v.error.stack) lines.push(`Stack:\n${v.error.stack}`);
        } else if (typeof v.error === "object") {
          const name = (v.error as { name?: string }).name ?? "unknown";
          const msg =
            (v.error as { message?: string }).message ??
            JSON.stringify(v.error, null, 2);
          lines.push(`Error: ${name}: ${msg}`);
          const stack = (v.error as { stack?: string }).stack;
          if (stack) lines.push(`Stack:\n${stack}`);
        } else {
          lines.push(`Error: ${String(v.error)}`);
        }
      }
      lines.push("");
    });
    return lines.join("\n");
  }, [props.data, location, extensionState, febboxKey]);

  useEffect(() => {
    getExtensionState().then((state: ExtensionStatus) => {
      setExtensionState(state);
    });
  }, []);

  if (extensionState === "disallowed" && conf().PROXY_URLS.length === 0) {
    return (
      <PlayerStageMessage
        poster={meta?.poster}
        mediaTitle={mediaTitle}
        badge={t("player.scraping.extensionFailure.badge")}
        badgeIcon={Icons.LOCK}
        heading={t("player.scraping.extensionFailure.title")}
        body={
          <Trans
            i18nKey="player.scraping.extensionFailure.text"
            components={{
              bold: <span className="font-bold text-white/80" />,
            }}
          />
        }
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/" theme="secondary" padding="md:px-12 p-2.5">
            {t("player.scraping.extensionFailure.homeButton")}
          </Button>
          <Button
            onClick={() => {
              sendPage({
                page: "PermissionGrant",
                redirectUrl: window.location.href,
              });
            }}
            theme="purple"
            padding="md:px-12 p-2.5"
          >
            {t("player.scraping.extensionFailure.enableExtension")}
          </Button>
        </div>
      </PlayerStageMessage>
    );
  }

  function handleOnboarding() {
    setOnboardingCompleted(false);
    navigate({
      pathname: "/onboarding",
      search: `redirect=${encodeURIComponent(location.pathname + location.search)}`,
    });
  }

  return (
    <>
      <PlayerStageMessage
        poster={meta?.poster}
        mediaTitle={mediaTitle}
        badge={t("player.scraping.notFound.badge")}
        heading={t("player.scraping.notFound.title")}
        body={t("player.scraping.notFound.text")}
      >
        <div className="flex flex-wrap justify-center gap-3">
          {props.onRetry ? (
            <Button onClick={() => props.onRetry?.()} theme="purple" padding="md:px-12 p-2.5">
              {t("player.scraping.notFound.retryButton")}
            </Button>
          ) : null}
          <Button href="/" theme="secondary" padding="md:px-12 p-2.5">
            {t("player.scraping.notFound.homeButton")}
          </Button>
          <Button onClick={() => modal.show()} theme="secondary" padding="md:px-12 p-2.5">
            {t("player.scraping.notFound.detailsButton")}
          </Button>
        </div>
        {(!isExtensionActiveCached() || !febboxKey) &&
        conf().HAS_ONBOARDING &&
        !isMobileOnboardingClient() ? (
          <div className="flex max-w-md flex-col items-center gap-3 pt-2">
            <p className="text-sm text-white/60">
              {t("player.scraping.notFound.onboarding")}
            </p>
            <Button onClick={() => handleOnboarding()} theme="purple" className="w-fit">
              {t("player.scraping.notFound.onboardingButton")}
            </Button>
          </div>
        ) : null}
      </PlayerStageMessage>
      {error ? (
        <ErrorCardInModal
          id={modal.id}
          onClose={() => modal.hide()}
          error={error}
        />
      ) : null}
    </>
  );
}
