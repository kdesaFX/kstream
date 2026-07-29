import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";
import type { AsyncReturnType } from "type-fest";

import { isPasskeySupported, verifyValidMnemonic } from "@/backend/accounts/crypto";
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
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";
import { useWatchHistoryStore } from "@/stores/watchHistory";

interface LoginFormPartProps {
  onLogin?: () => void;
}

export function LoginFormPart(props: LoginFormPartProps) {
  const [showPassphraseLogin, setShowPassphraseLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [device, setDevice] = useState("");
  const {
    login,
    loginWithPassword,
    loginWithPasskey,
    restore,
    importData,
  } = useAuth();
  const backendUrl = useBackendUrl();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const watchHistoryItems = useWatchHistoryStore((store) => store.items);
  const { t } = useTranslation();

  const finishLogin = async (account: AsyncReturnType<typeof login>) => {
    if (!account) throw new Error(t("auth.login.validationError") ?? undefined);
    await importData(account, progressItems, bookmarkItems, watchHistoryItems, false);
    await restore(account);
    props.onLogin?.();
  };

  const [passwordResult, executePassword] = useAsyncFn(
    async (inputUsername: string, inputPassword: string, inputDevice: string) => {
      if (!backendUrl) {
        throw new Error(t("auth.login.noBackendUrl") ?? "No backend URL");
      }
      const validatedDevice = inputDevice.trim();
      if (validatedDevice.length === 0) {
        throw new Error(t("auth.login.deviceLengthError") ?? undefined);
      }

      let account: AsyncReturnType<typeof loginWithPassword>;
      try {
        account = await loginWithPassword({
          username: inputUsername.trim(),
          password: inputPassword,
          device: validatedDevice,
        });
      } catch (err) {
        if ((err as any).status === 401)
          throw new Error(t("auth.login.validationError") ?? undefined);
        throw err;
      }
      await finishLogin(account);
    },
    [backendUrl, loginWithPassword, t, progressItems, bookmarkItems, watchHistoryItems],
  );

  const [passkeyResult, executePasskey] = useAsyncFn(
    async (inputDevice: string) => {
      if (!backendUrl) {
        throw new Error(t("auth.login.noBackendUrl") ?? "No backend URL");
      }
      const validatedDevice = inputDevice.trim();
      if (validatedDevice.length === 0) {
        throw new Error(t("auth.login.deviceLengthError") ?? undefined);
      }

      let account: AsyncReturnType<typeof loginWithPasskey>;
      try {
        account = await loginWithPasskey(validatedDevice);
      } catch (err) {
        if ((err as any).status === 401)
          throw new Error(t("auth.login.validationError") ?? undefined);
        throw err;
      }
      await finishLogin(account);
    },
    [backendUrl, loginWithPasskey, t, progressItems, bookmarkItems, watchHistoryItems],
  );

  const [passphraseResult, executePassphrase] = useAsyncFn(
    async (inputMnemonic: string, inputDevice: string) => {
      if (!verifyValidMnemonic(inputMnemonic))
        throw new Error(t("auth.login.validationError") ?? undefined);

      const validatedDevice = inputDevice.trim();
      if (validatedDevice.length === 0)
        throw new Error(t("auth.login.deviceLengthError") ?? undefined);

      let account: AsyncReturnType<typeof login>;
      try {
        account = await login({
          mnemonic: inputMnemonic,
          userData: { device: validatedDevice },
        });
      } catch (err) {
        if ((err as any).status === 401)
          throw new Error(t("auth.login.validationError") ?? undefined);
        throw err;
      }
      await finishLogin(account);
    },
    [login, t, progressItems, bookmarkItems, watchHistoryItems],
  );

  if (showPassphraseLogin) {
    return (
      <LargeCard top={<BrandPill backgroundClass="bg-[#161527]" />}>
        <LargeCardText title={t("auth.login.title")}>
          {t("auth.login.description")}
        </LargeCardText>
        <div className="space-y-4">
          <AuthInputBox
            label={t("auth.deviceNameLabel") ?? undefined}
            value={device}
            onChange={setDevice}
            placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
          />
          <AuthInputBox
            label={t("auth.login.passphraseLabel") ?? undefined}
            value={mnemonic}
            autoComplete="username"
            name="username"
            onChange={setMnemonic}
            placeholder={t("auth.login.passphrasePlaceholder") ?? undefined}
            passwordToggleable
          />
          {passphraseResult.error && !passphraseResult.loading ? (
            <p className="text-authentication-errorText">
              {passphraseResult.error.message}
            </p>
          ) : null}
        </div>
        <LargeCardButtons>
          <Button
            theme="purple"
            loading={passphraseResult.loading}
            onClick={() => executePassphrase(mnemonic, device)}
          >
            {t("auth.login.submit")}
          </Button>
          <Button theme="secondary" onClick={() => setShowPassphraseLogin(false)}>
            {t("auth.back") ?? "Back"}
          </Button>
        </LargeCardButtons>
      </LargeCard>
    );
  }

  return (
    <LargeCard top={<BrandPill backgroundClass="bg-[#161527]" />}>
      <LargeCardText title={t("auth.login.title")}>
        {t("auth.login.description")}
      </LargeCardText>
      <div className="space-y-4">
        <AuthInputBox
          label={t("auth.deviceNameLabel") ?? undefined}
          value={device}
          onChange={setDevice}
          placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
        />
        <AuthInputBox
          label={t("auth.password.usernameLabel") ?? "Username"}
          value={username}
          autoComplete="username"
          name="username"
          onChange={setUsername}
        />
        <AuthInputBox
          label={t("auth.password.passwordLabel") ?? "Password"}
          value={password}
          autoComplete="current-password"
          name="current-password"
          onChange={setPassword}
          passwordToggleable
        />
        {isPasskeySupported() && (
          <div className="relative mb-4">
            <div className="relative my-4">
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
              onClick={() => executePasskey(device)}
              loading={passkeyResult.loading}
              disabled={
                passkeyResult.loading ||
                passwordResult.loading ||
                device.trim().length === 0
              }
              className="w-full"
            >
              <Icon icon={Icons.LOCK} className="mr-2" />
              {t("auth.login.usePasskey")}
            </Button>
          </div>
        )}
        {(passwordResult.error || passkeyResult.error) &&
        !passwordResult.loading &&
        !passkeyResult.loading ? (
          <p className="text-authentication-errorText">
            {passwordResult.error?.message || passkeyResult.error?.message}
          </p>
        ) : null}
      </div>

      <LargeCardButtons>
        <Button
          theme="purple"
          loading={passwordResult.loading}
          onClick={() => executePassword(username, password, device)}
        >
          {t("auth.login.submit")}
        </Button>
      </LargeCardButtons>
      <p className="text-center mt-6">
        <button
          type="button"
          className="text-type-secondary hover:text-white transition-colors"
          onClick={() => setShowPassphraseLogin(true)}
        >
          {t("auth.login.usePassphrase") ?? "Log in with a recovery phrase instead"}
        </button>
      </p>
      <p className="text-center mt-6">
        <Trans i18nKey="auth.createAccount">
          <MwLink to="/register">.</MwLink>
        </Trans>
      </p>
    </LargeCard>
  );
}
