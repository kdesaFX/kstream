import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { FancyModal, useModal } from "@/components/overlays/Modal";
import { useIsDesktopApp } from "@/hooks/useIsDesktopApp";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { isLocalOrigin } from "@/utils/hosting/isLocalOrigin";

export type DesktopAppInfo = {
  streamUrl: string;
  runMode: string;
  originMode: string;
  installDir: string;
  version: string;
};

const MODAL_ID = "desktop-app-settings";

async function fetchDesktopAppInfo(): Promise<DesktopAppInfo | null> {
  const ipc = window.__KSTREAM_DESKTOP_IPC__;
  if (!ipc?.invoke) return null;
  try {
    const res = await ipc.invoke("getDesktopAppInfo");
    if (!res || typeof res !== "object") return null;
    return {
      streamUrl: String(res.streamUrl || ""),
      runMode: String(res.runMode || "unknown"),
      originMode: String(res.originMode || ""),
      installDir: String(res.installDir || ""),
      version: String(res.version || ""),
    };
  } catch {
    return null;
  }
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-type-dimmed text-sm font-medium">{props.label}</p>
      <p className="text-white text-sm break-all">{props.value || "—"}</p>
    </div>
  );
}

export function DesktopAppSettingsModal({ id = MODAL_ID }: { id?: string }) {
  const { t } = useTranslation();
  const modal = useModal(id);
  const showModal = useOverlayStack((s) => s.showModal);
  const isDesktop = useIsDesktopApp();
  const [info, setInfo] = useState<DesktopAppInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // Backup for any leftover dispatchEvent callers
  useEffect(() => {
    if (!isDesktop) return;
    const open = () => showModal(id);
    window.addEventListener("pstream-desktop-settings", open);
    return () => window.removeEventListener("pstream-desktop-settings", open);
  }, [isDesktop, id, showModal]);

  useEffect(() => {
    if (!modal.isShown) return;
    let cancelled = false;
    setLoading(true);
    void fetchDesktopAppInfo().then((next) => {
      if (cancelled) return;
      setInfo(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [modal.isShown]);

  const originMode =
    info?.originMode ||
    (isDesktop && isLocalOrigin() ? "bundled" : isDesktop ? "remote" : "");
  const originLabel =
    originMode === "bundled"
      ? t("desktopApp.settings.originBundled")
      : originMode === "remote"
        ? t("desktopApp.settings.originRemote")
        : originMode;

  // Keep mounted on web too so the id always exists; content only loads on desktop.
  return (
    <FancyModal id={id} title={t("desktopApp.settings.title")} size="md">
      <div className="space-y-5">
        <p className="text-type-secondary text-sm">
          {t("desktopApp.settings.description")}
        </p>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-mediaCard-hoverBackground rounded w-2/3" />
            <div className="h-4 bg-mediaCard-hoverBackground rounded w-1/2" />
            <div className="h-4 bg-mediaCard-hoverBackground rounded w-3/4" />
          </div>
        ) : (
          <div className="rounded-xl bg-largeCard-background bg-opacity-50 p-4 space-y-4">
            <InfoRow
              label={t("desktopApp.settings.url")}
              value={info?.streamUrl || (isDesktop ? "" : "—")}
            />
            <InfoRow
              label={t("desktopApp.settings.mode")}
              value={info?.runMode || ""}
            />
            <InfoRow
              label={t("desktopApp.settings.origin")}
              value={originLabel}
            />
            <InfoRow
              label={t("desktopApp.settings.installFolder")}
              value={info?.installDir || ""}
            />
            <InfoRow
              label={t("desktopApp.settings.version")}
              value={info?.version || ""}
            />
          </div>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-buttons-secondaryBorder/40 bg-buttons-secondary/20 px-4 py-3">
          <Icon
            icon={Icons.CIRCLE_EXCLAMATION}
            className="text-type-secondary text-lg mt-0.5 shrink-0"
          />
          <p className="text-type-secondary text-sm leading-relaxed">
            {originMode === "bundled"
              ? t("desktopApp.settings.schoolNote")
              : t("desktopApp.settings.smartScreenNote")}
          </p>
        </div>

        <div className="flex justify-end">
          <Button theme="purple" onClick={modal.hide}>
            {t("desktopApp.settings.close")}
          </Button>
        </div>
      </div>
    </FancyModal>
  );
}
