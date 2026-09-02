import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { SessionResponse } from "@/backend/accounts/auth";
import { isLegacyEncryptedName } from "@/backend/accounts/crypto";
import { removeSession } from "@/backend/accounts/sessions";
import { Button } from "@/components/buttons/Button";
import { Loading } from "@/components/layout/Loading";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { SecondaryLabel } from "@/components/text/SecondaryLabel";
import { Heading2, Paragraph } from "@/components/utils/Text";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";

/** Used by AccountActionsPart — clicks every non-current device remove button. */
export const signOutAllDevices = () => {
  const buttons = document.querySelectorAll(".logout-button");
  buttons.forEach((button) => {
    (button as HTMLElement).click();
  });
};

function formatLastSeen(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "Active just now";
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `Active ${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `Active ${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `Active ${days}d ago`;
}

export function Device(props: {
  name: string;
  id: string;
  lastSeen?: string;
  isCurrent?: boolean;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const url = useBackendUrl();
  const token = useAuthStore((s) => s.account?.token);
  const [result, exec] = useAsyncFn(async () => {
    if (!token) throw new Error("No token present");
    if (!url) throw new Error("No backend set");
    await removeSession(url, token, props.id);
    props.onRemove?.();
  }, [url, token, props.id, props.onRemove]);

  const lastSeenLabel = props.lastSeen ? formatLastSeen(props.lastSeen) : null;

  return (
    <SettingsCard
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      paddingClass="px-6 py-4"
    >
      <div className="min-w-0 flex-1">
        <SecondaryLabel>
          {t("settings.account.devices.deviceNameLabel")}
        </SecondaryLabel>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-white">{props.name}</p>
          {props.isCurrent ? (
            <span className="inline-flex rounded-full bg-type-link/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-type-link">
              {t("settings.account.devices.currentDevice")}
            </span>
          ) : null}
        </div>
        {lastSeenLabel ? (
          <p className="mt-1 text-sm text-type-secondary">{lastSeenLabel}</p>
        ) : null}
      </div>
      {!props.isCurrent ? (
        <Button
          theme="danger"
          className="logout-button w-full shrink-0 sm:w-auto"
          loading={result.loading}
          onClick={exec}
        >
          {t("settings.account.devices.removeDevice")}
        </Button>
      ) : null}
    </SettingsCard>
  );
}

export function DeviceListPart(props: {
  loading?: boolean;
  error?: boolean;
  sessions: SessionResponse[];
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const { signOutEverywhere } = useAuth();
  const sessions = props.sessions;
  const currentSessionId = useAuthStore((s) => s.account?.sessionId);
  const currentDeviceName = useAuthStore((s) => s.account?.deviceName);
  const [signOutResult, executeSignOutEverywhere] = useAsyncFn(async () => {
    await signOutEverywhere();
    window.location.href = "/login";
  }, [signOutEverywhere]);

  const deviceListSorted = useMemo(() => {
    let list = sessions.map((session) => {
      const current =
        session.id === currentSessionId ||
        (!!currentDeviceName &&
          (session.id === currentDeviceName ||
            session.device === currentDeviceName));
      return {
        current,
        id: session.id,
        lastSeen: session.accessedAt,
        name:
          session.device && !isLegacyEncryptedName(session.device)
            ? session.device
            : t("settings.account.devices.unknownDevice"),
      };
    });
    list = list.sort((a, b) => {
      if (a.current) return -1;
      if (b.current) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [sessions, currentSessionId, currentDeviceName, t]);

  return (
    <div className="pt-8">
      <Heading2 border className="mb-6">
        {t("settings.account.security.sessionsTitle")}
      </Heading2>
      <Paragraph className="!mt-0 mb-6 text-sm">
        {t("settings.account.devices.description")}
      </Paragraph>
      {props.loading && deviceListSorted.length === 0 ? (
        <Loading />
      ) : props.error && deviceListSorted.length === 0 ? (
        <p>{t("settings.account.devices.failed")}</p>
      ) : deviceListSorted.length === 0 ? (
        <SettingsCard className="mb-4" paddingClass="px-6 py-4">
          <p className="text-type-secondary text-sm">
            {t("settings.account.devices.empty")}
          </p>
        </SettingsCard>
      ) : (
        <div className="mb-4 space-y-3">
          {deviceListSorted.map((session) => (
            <Device
              name={session.name}
              id={session.id}
              lastSeen={session.lastSeen}
              key={session.id}
              isCurrent={session.current}
              onRemove={props.onChange}
            />
          ))}
        </div>
      )}
      <SettingsCard>
        <div className="space-y-3">
          <Paragraph className="!mt-0 text-sm">
            {t("settings.account.security.signOutEverywhereDescription")}
          </Paragraph>
          {signOutResult.error ? (
            <p className="text-authentication-errorText">
              {signOutResult.error.message}
            </p>
          ) : null}
          <Button
            theme="danger"
            loading={signOutResult.loading}
            onClick={() => executeSignOutEverywhere()}
          >
            {t("settings.account.security.signOutEverywhere")}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
