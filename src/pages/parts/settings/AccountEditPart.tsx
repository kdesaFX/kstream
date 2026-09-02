import { useTranslation } from "react-i18next";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { useModal } from "@/components/overlays/Modal";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { ProfileEditModal } from "@/pages/parts/settings/ProfileEditModal";

export function AccountEditPart(props: {
  deviceName: string;
  setDeviceName: (s: string) => void;
  nickname: string;
  setNickname: (s: string) => void;
  colorA: string;
  colorB: string;
  userIcon: string;
  avatarUrl?: string | null;
  setAvatarUrl: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const profileEditModal = useModal("profile-edit");

  return (
    <SettingsCard paddingClass="px-6 py-8 sm:px-8 sm:py-10" className="!mt-8">
      <ProfileEditModal
        id={profileEditModal.id}
        close={profileEditModal.hide}
        colorA={props.colorA}
        colorB={props.colorB}
        userIcon={props.userIcon}
        nickname={props.nickname}
        avatarUrl={props.avatarUrl}
        setAvatarUrl={props.setAvatarUrl}
      />
      <div className="grid gap-8 lg:grid-cols-[auto,minmax(0,1fr)] lg:items-start">
        <div className="flex justify-center lg:justify-start">
          <Avatar
            profile={{
              colorA: props.colorA,
              colorB: props.colorB,
              icon: props.userIcon,
              avatarUrl: props.avatarUrl,
            }}
            nickname={props.nickname}
            iconClass="text-5xl"
            sizeClass="w-32 h-32"
            bottom={
              <button
                type="button"
                className="tabbable text-xs flex gap-2 items-center bg-editBadge-bg text-editBadge-text hover:bg-editBadge-bgHover py-1 px-3 rounded-full cursor-pointer"
                onClick={profileEditModal.show}
              >
                <Icon icon={Icons.EDIT} />
                {t("settings.account.accountDetails.editProfile")}
              </button>
            }
          />
        </div>
        <div className="min-w-0">
          <div className="grid gap-4 md:grid-cols-2">
            <AuthInputBox
              label={t("settings.account.accountDetails.nicknameLabel")}
              placeholder={t(
                "settings.account.accountDetails.nicknamePlaceholder",
              )}
              value={props.nickname}
              onChange={(value) => props.setNickname(value)}
              className="w-full"
            />
            <AuthInputBox
              label={t("settings.account.accountDetails.deviceNameLabel")}
              placeholder={t(
                "settings.account.accountDetails.deviceNamePlaceholder",
              )}
              value={props.deviceName}
              onChange={(value) => props.setDeviceName(value)}
              className="w-full"
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="logout-button" theme="danger" onClick={logout}>
              {t("settings.account.accountDetails.logoutButton")}
            </Button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
