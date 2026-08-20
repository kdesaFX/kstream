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
import { Heading2 } from "@/components/utils/Text";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";

export const signOutAllDevices = () => {
  const buttons = document.querySelectorAll(".logout-button");

  buttons.forEach((button) => {
    (button as HTMLElement).click();
  });
};

export function Device(props: {
  name: string;
  id: string;
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
  }, [url, token, props.id]);

  return (
    <SettingsCard
      className="flex justify-between items-center"
      paddingClass="px-6 py-4"
    >
      <div className="font-medium">
        <SecondaryLabel>
          {t("settings.account.devices.deviceNameLabel")}
        </SecondaryLabel>
        <p className="text-white">{props.name}</p>
      </div>
      {!props.isCurrent ? (
        <Button
          theme="danger"
          className="logout-button"
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
  const sessions = props.sessions;
  const currentSessionId = useAuthStore((s) => s.account?.sessionId);
  const currentDeviceName = useAuthStore((s) => s.account?.deviceName);
  const deviceListSorted = useMemo(() => {
    let list = sessions.map((session) => {
      // Supabase devices use device_name as the session id; match on name too.
      const current =
        session.id === currentSessionId ||
        (!!currentDeviceName &&
          (session.id === currentDeviceName ||
            session.device === currentDeviceName));
      return {
        current,
        id: session.id,
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
      <Heading2 border className="mt-0 mb-9">
        {t("settings.account.devices.title")}
      </Heading2>
      {props.loading && deviceListSorted.length === 0 ? (
        <Loading />
      ) : props.error && deviceListSorted.length === 0 ? (
        <p>{t("settings.account.devices.failed")}</p>
      ) : (
        <div className="space-y-5">
          {deviceListSorted.map((session) => (
            <Device
              name={session.name}
              id={session.id}
              key={session.id}
              isCurrent={session.current}
              onRemove={props.onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
