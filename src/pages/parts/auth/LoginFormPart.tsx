import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";
import type { AsyncReturnType } from "type-fest";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { BrandPill } from "@/components/layout/BrandPill";
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

interface LoginFormPartProps {
  onLogin?: () => void;
}

export function LoginFormPart(props: LoginFormPartProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [device, setDevice] = useState("This device");
  const { login, loginWithGoogle, restore, importData } = useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const watchHistoryItems = useWatchHistoryStore((store) => store.items);
  const mangaProgressItems = useMangaProgressStore((store) => store.items);
  const { t } = useTranslation();

  const finishLogin = async (account: AsyncReturnType<typeof login>) => {
    if (!account) throw new Error(t("auth.login.validationError") ?? undefined);
    await importData(
      account,
      progressItems,
      bookmarkItems,
      watchHistoryItems,
      false,
      mangaProgressItems,
    );
    await restore(account);
    props.onLogin?.();
  };

  const [loginResult, executeLogin] = useAsyncFn(
    async (inputEmail: string, inputPassword: string, inputDevice: string) => {
      const validatedEmail = inputEmail.trim();
      const validatedDevice = inputDevice.trim();
      if (validatedEmail.length === 0 || inputPassword.length === 0) {
        throw new Error(t("auth.login.validationError") ?? undefined);
      }
      if (validatedDevice.length === 0) {
        throw new Error(t("auth.login.deviceLengthError") ?? undefined);
      }

      let account: AsyncReturnType<typeof login>;
      try {
        account = await login({
          email: validatedEmail,
          password: inputPassword,
          userData: { device: validatedDevice },
        });
      } catch (err) {
        const message = (err as Error).message?.toLowerCase() ?? "";
        if (message.includes("invalid") || message.includes("credentials")) {
          throw new Error(t("auth.login.validationError") ?? undefined);
        }
        throw err;
      }
      await finishLogin(account);
    },
    [login, t, progressItems, bookmarkItems, watchHistoryItems, mangaProgressItems],
  );

  const [googleResult, executeGoogle] = useAsyncFn(async () => {
    await loginWithGoogle();
  }, [loginWithGoogle]);

  return (
    <LargeCard top={<BrandPill backgroundClass="bg-[#161527]" />}>
      <LargeCardText title={t("auth.login.title")}>
        {t("auth.login.description")}
      </LargeCardText>
      <div className="space-y-4">
        <AuthInputBox
          label={t("auth.emailLabel") ?? "Email"}
          value={email}
          autoComplete="email"
          name="email"
          onChange={setEmail}
          placeholder={t("auth.emailPlaceholder") ?? undefined}
        />
        <AuthInputBox
          label={t("auth.deviceNameLabel") ?? undefined}
          value={device}
          onChange={setDevice}
          placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
        />
        <AuthInputBox
          label={t("auth.password.passwordLabel") ?? "Password"}
          value={password}
          autoComplete="current-password"
          name="current-password"
          onChange={setPassword}
          passwordToggleable
        />
        {loginResult.error && !loginResult.loading ? (
          <p className="text-authentication-errorText">
            {loginResult.error.message}
          </p>
        ) : null}
      </div>

      <LargeCardButtons>
        <Button
          theme="purple"
          loading={loginResult.loading}
          disabled={googleResult.loading}
          onClick={() => executeLogin(email, password, device)}
        >
          {t("auth.login.submit")}
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
          disabled={loginResult.loading}
          onClick={() => executeGoogle()}
          className="w-full"
        >
          <span className="inline-flex items-center gap-2">
            <Icon icon={Icons.GOOGLE} className="text-xl leading-none" />
            {t("auth.login.google") ?? "Continue with Google"}
          </span>
        </Button>
        {googleResult.error ? (
          <p className="text-authentication-errorText text-center">
            {googleResult.error.message}
          </p>
        ) : null}
      </LargeCardButtons>
      <p className="text-center mt-6">
        <Trans i18nKey="auth.createAccount">
          <MwLink to="/register">.</MwLink>
        </Trans>
      </p>
    </LargeCard>
  );
}
