import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFileButton } from "@/components/Avatar";
import { Button } from "@/components/buttons/Button";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { initialColor } from "@/components/form/ColorPicker";
import { initialIcon } from "@/components/form/IconPicker";

export interface AccountProfile {
  device: string;
  pendingAvatar?: File | null;
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
    avatarUrl?: string | null;
  };
}

interface AccountCreatePartProps {
  onNext?: (data: AccountProfile) => void;
}

export function AccountCreatePart(props: AccountCreatePartProps) {
  const [device, setDevice] = useState("This device");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const { t } = useTranslation();
  const [hasDeviceError, setHasDeviceError] = useState(false);

  const nextStep = useCallback(() => {
    setHasDeviceError(false);
    const validatedDevice = device.trim();
    if (validatedDevice.length === 0) {
      setHasDeviceError(true);
      return;
    }

    props.onNext?.({
      device: validatedDevice,
      pendingAvatar,
      profile: {
        colorA: initialColor,
        colorB: initialColor,
        icon: initialIcon,
        avatarUrl: preview,
      },
    });
  }, [device, props, pendingAvatar, preview]);

  return (
    <LargeCard>
      <LargeCardText
        icon={
          <Avatar
            profile={{
              colorA: initialColor,
              colorB: initialColor,
              icon: initialIcon,
              avatarUrl: preview,
            }}
            iconClass="text-3xl"
            sizeClass="w-16 h-16"
          />
        }
        title={t("auth.register.information.title") ?? undefined}
      >
        {t("auth.register.information.headerPhoto")}
      </LargeCardText>
      <div className="space-y-6">
        <div className="flex justify-center">
          <AvatarFileButton
            onFile={(file) => {
              if (preview) URL.revokeObjectURL(preview);
              setPendingAvatar(file);
              setPreview(URL.createObjectURL(file));
            }}
            className="tabbable rounded-full bg-buttons-purple px-5 py-2 text-sm font-semibold text-white"
          >
            {t("settings.account.profile.upload")}
          </AvatarFileButton>
        </div>
        <AuthInputBox
          label={t("auth.deviceNameLabel") ?? undefined}
          value={device}
          onChange={setDevice}
          placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
        />
        {hasDeviceError ? (
          <p className="text-authentication-errorText">
            {t("auth.login.deviceLengthError")}
          </p>
        ) : null}
      </div>
      <LargeCardButtons>
        <Button theme="purple" onClick={() => nextStep()}>
          {t("auth.register.information.next")}
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
