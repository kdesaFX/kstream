import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { initialColor } from "@/components/form/ColorPicker";
import { initialIcon } from "@/components/form/IconPicker";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { MwLink } from "@/components/text/Link";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { useProgressStore } from "@/stores/progress";
import { useWatchHistoryStore } from "@/stores/watchHistory";
import { suggestDeviceName } from "@/utils/deviceClient";

interface RegisterCredentialsPartProps {
  onNext?: () => void;
}

const defaultUserData = {
  device: suggestDeviceName(),
  profile: {
    colorA: initialColor,
    colorB: initialColor,
    icon: initialIcon,
  },
};

export function RegisterCredentialsPart(props: RegisterCredentialsPartProps) {
  const { t } = useTranslation();
  const { register, loginWithGoogle, loginWithDiscord, restore, importData } =
    useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const watchHistoryItems = useWatchHistoryStore((store) => store.items);
  const mangaProgressItems = useMangaProgressStore((store) => store.items);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [registerResult, doRegister] = useAsyncFn(async () => {
    if (password !== confirmPassword) {
      throw new Error(t("auth.password.mismatch") ?? "Passwords do not match");
    }
    const validatedEmail = email.trim();
    if (!validatedEmail || password.length < 6) {
      throw new Error(t("auth.register.validationError") ?? "Invalid registration details");
    }

    const account = await register({
      email: validatedEmail,
      password,
      userData: {
        device: defaultUserData.device,
        profile: defaultUserData.profile,
        nickname: validatedEmail.split("@")[0],
      },
    });
    await importData(
      account,
      progressItems,
      bookmarkItems,
      watchHistoryItems,
      false,
      mangaProgressItems,
    );
    await restore(account);
    props.onNext?.();
  }, [
    register,
    email,
    password,
    confirmPassword,
    props,
    importData,
    restore,
    progressItems,
    bookmarkItems,
    watchHistoryItems,
    mangaProgressItems,
    t,
  ]);

  const [googleResult, doGoogle] = useAsyncFn(async () => {
    await loginWithGoogle();
  }, [loginWithGoogle]);

  const [discordResult, doDiscord] = useAsyncFn(async () => {
    await loginWithDiscord();
  }, [loginWithDiscord]);

  const oauthBusy = googleResult.loading || discordResult.loading;

  return (
    <LargeCard>
      <LargeCardText
        title={t("auth.password.registerTitle") ?? "Create your account"}
      >
        {t("auth.password.registerDescription") ??
          "Enter your email and password to sign up."}
      </LargeCardText>
      <div className="space-y-4">
        <AuthInputBox
          label={t("auth.emailLabel") ?? "Email"}
          autoComplete="email"
          name="email"
          value={email}
          onChange={setEmail}
        />
        <AuthInputBox
          label={t("auth.password.passwordLabel") ?? "Password"}
          autoComplete="new-password"
          name="new-password"
          value={password}
          onChange={setPassword}
          passwordToggleable
        />
        <AuthInputBox
          label={t("auth.password.confirmPasswordLabel") ?? "Confirm password"}
          autoComplete="new-password"
          name="confirm-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          passwordToggleable
        />
      </div>
      {(registerResult.error || googleResult.error || discordResult.error) && (
        <p className="mt-3 text-authentication-errorText">
          {registerResult.error?.message ??
            googleResult.error?.message ??
            discordResult.error?.message}
        </p>
      )}
      <LargeCardButtons>
        <Button
          theme="purple"
          loading={registerResult.loading}
          disabled={
            oauthBusy ||
            !email.trim() ||
            !password ||
            !confirmPassword
          }
          onClick={() => doRegister()}
        >
          {t("auth.register.information.next")}
        </Button>
        <div className="relative my-2 w-full">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-authentication-border/50" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-authentication-bg text-authentication-text">
              {t("auth.login.or")}
            </span>
          </div>
        </div>
        <Button
          theme="secondary"
          loading={googleResult.loading}
          disabled={registerResult.loading || discordResult.loading}
          onClick={() => doGoogle()}
          className="w-full"
        >
          <span className="inline-flex items-center gap-2">
            <Icon icon={Icons.GOOGLE} className="text-xl leading-none" />
            {t("auth.login.google") ?? "Continue with Google"}
          </span>
        </Button>
        <Button
          theme="secondary"
          loading={discordResult.loading}
          disabled={registerResult.loading || googleResult.loading}
          onClick={() => doDiscord()}
          className="w-full"
        >
          <span className="inline-flex items-center gap-2">
            <Icon icon={Icons.DISCORD} className="text-xl leading-none" />
            {t("auth.login.discord") ?? "Continue with Discord"}
          </span>
        </Button>
      </LargeCardButtons>
      <p className="text-center mt-6">
        <Trans i18nKey="auth.hasAccount">
          <MwLink to="/login">.</MwLink>
        </Trans>
      </p>
    </LargeCard>
  );
}
