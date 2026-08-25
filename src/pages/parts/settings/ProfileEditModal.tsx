import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { removeAvatar, uploadAvatar } from "@/backend/supabase/data";
import { Avatar, AvatarFileButton } from "@/components/Avatar";
import { Button } from "@/components/buttons/Button";
import { Modal, ModalCard } from "@/components/overlays/Modal";
import { Heading2 } from "@/components/utils/Text";
import { useAuthStore } from "@/stores/auth";

export interface ProfileEditModalProps {
  id: string;
  close?: () => void;
  colorA: string;
  colorB: string;
  userIcon: string;
  nickname?: string;
  avatarUrl?: string | null;
  setAvatarUrl: (url: string | null) => void;
}

export function ProfileEditModal(props: ProfileEditModalProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.account?.userId);
  const setAccountProfile = useAuthStore((s) => s.setAccountProfile);
  const account = useAuthStore((s) => s.account);
  const [preview, setPreview] = useState<string | null>(null);

  const shownUrl = preview ?? props.avatarUrl ?? null;

  const [uploadState, doUpload] = useAsyncFn(
    async (file: File) => {
      if (!userId || !account) throw new Error("Not signed in");
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      try {
        const url = await uploadAvatar(userId, file);
        props.setAvatarUrl(url);
        setAccountProfile({ ...account.profile, avatarUrl: url });
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
        throw err;
      }
    },
    [userId, account, props, setAccountProfile],
  );

  const [removeState, doRemove] = useAsyncFn(async () => {
    if (!userId || !account) throw new Error("Not signed in");
    await removeAvatar(userId);
    props.setAvatarUrl(null);
    setAccountProfile({ ...account.profile, avatarUrl: null });
    setPreview(null);
  }, [userId, account, props, setAccountProfile]);

  const error = uploadState.error ?? removeState.error;
  const loading = uploadState.loading || removeState.loading;

  return (
    <Modal id={props.id}>
      <ModalCard>
        <Heading2 className="!mt-0">
          {t("settings.account.profile.title")}
        </Heading2>
        <p className="text-sm text-type-secondary mb-6">
          {t("settings.account.profile.hint")}
        </p>
        <div className="flex flex-col items-center gap-5">
          <Avatar
            profile={{
              colorA: props.colorA,
              colorB: props.colorB,
              icon: props.userIcon,
              avatarUrl: shownUrl,
            }}
            nickname={props.nickname}
            iconClass="text-5xl"
            sizeClass="w-32 h-32"
          />
          {error ? (
            <p className="text-sm text-authentication-errorText text-center">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            <AvatarFileButton
              disabled={loading}
              onFile={(file) => {
                void doUpload(file);
              }}
              className="tabbable rounded-full bg-buttons-purple px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading
                ? t("settings.account.profile.uploading")
                : t("settings.account.profile.upload")}
            </AvatarFileButton>
            {shownUrl ? (
              <Button
                theme="secondary"
                disabled={loading}
                onClick={() => void doRemove()}
              >
                {t("settings.account.profile.remove")}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex justify-center mt-8">
          <Button theme="purple" className="!px-20" onClick={props.close}>
            {t("settings.account.profile.finish")}
          </Button>
        </div>
      </ModalCard>
    </Modal>
  );
}
