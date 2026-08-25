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

function formatLastSeen(iso: string, t: (key: string, opts?: object) => string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) {
    return t("settings.account.devices.lastSeenJustNow") ?? "Active just now";
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return (
      t("settings.account.devices.lastSeenMinutes", { count: mins }) ??
      `Active ${mins}m ago`
    );
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return (
      t("settings.account.devices.lastSeenHours", { count: hours }) ??
      `Active ${hours}h ago`
    );
  }
  const days = Math.floor(seconds / 86400);
  return (
    t("settings.account.devices.lastSeenDays", { count: days }) ??
    `Active ${days}d ago`
  );
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

  const lastSeenLabel = props.lastSeen
    ? formatLastSeen(props.lastSeen, t)
    : null;

  return (
    <SettingsCard
      className="flex justify-between items-center gap-4"
      paddingClass="px-6 py-4"
    >
      <div className="font-medium min-w-0">
        <SecondaryLabel>
          {t("settings.account.devices.deviceNameLabel")}
        </SecondaryLabel>
        <p className="text-white truncate">
          {props.name}
          {props.isCurrent ? (
            <span className="ml-2 text-xs font-semibold text-type-link">
              {t("settings.account.devices.currentDevice") ?? "Current"}
            </span>
          ) : null}
        </p>
        {lastSeenLabel ? (
          <p className="text-sm text-type-secondary mt-0.5">{lastSeenLabel}</p>
        ) : null}
      </div>
      {!props.isCurrent ? (
        <Button
          theme="danger"
          className="logout-button shrink-0"
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
    <div>
      <Heading2 border className="mt-0 mb-6">
        {t("settings.account.security.sessionsTitle") ?? "Sessions"}
      </Heading2>
      <Paragraph className="!mt-0 mb-6 text-sm">
        {t("settings.account.devices.description") ??
          "Browsers and apps where you are signed in. Remove a device to forget it here — use Sign out everywhere to revoke every session."}
      </Paragraph>
      {props.loading && deviceListSorted.length === 0 ? (
        <Loading />
      ) : props.error && deviceListSorted.length === 0 ? (
        <p>{t("settings.account.devices.failed")}</p>
      ) : deviceListSorted.length === 0 ? (
        <SettingsCard className="mb-4" paddingClass="px-6 py-4">
          <p className="text-type-secondary text-sm">
            {t("settings.account.devices.empty") ??
              "No other devices yet. Sign in from another browser to see it listed here."}
          </p>
        </SettingsCard>
      ) : (
        <div className="space-y-3 mb-4">
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
            {t("settings.account.security.signOutEverywhereDescription") ??
              "Sign out on every device where you are logged in to K-Stream."}
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
            {t("settings.account.security.signOutEverywhere") ??
              "Sign out everywhere"}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
