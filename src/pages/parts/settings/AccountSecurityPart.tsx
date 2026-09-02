import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsync, useAsyncFn } from "react-use";

import { getAuthStatus } from "@/backend/accounts/auth";
import {
  changeEmail,
  changePassword,
  linkDiscordAccount,
  linkGoogleAccount,
  unlinkOAuthAccount,
} from "@/backend/supabase/data";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { Heading2, Paragraph } from "@/components/utils/Text";
import { AccountWithToken } from "@/stores/auth";

function ChangeEmailForm(props: { currentEmail: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(props.currentEmail ?? "");
  const [sent, setSent] = useState(false);
  const [result, execute] = useAsyncFn(async () => {
    await changeEmail(email);
    setSent(true);
  }, [email]);

  return (
    <div className="space-y-4">
      <AuthInputBox
        label={t("settings.account.security.emailLabel")}
        autoComplete="email"
        name="email"
        value={email}
        onChange={setEmail}
      />
      <Paragraph className="!mt-0 text-xs text-type-secondary">
        {t("settings.account.security.emailChangeHint")}
      </Paragraph>
      {result.error ? (
        <p className="text-authentication-errorText">{result.error.message}</p>
      ) : null}
      {sent ? (
        <p className="text-sm text-green-400">
          {t("settings.account.security.emailChangeSent")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          theme="purple"
          loading={result.loading}
          disabled={!email.trim() || email.trim() === props.currentEmail}
          onClick={() => execute()}
        >
          {t("settings.account.security.changeEmailSubmit")}
        </Button>
        <Button theme="secondary" onClick={props.onDone}>
          {t("settings.account.profile.finish")}
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordForm(props: {
  isAdd: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [result, execute] = useAsyncFn(async () => {
    if (password !== confirmPassword) {
      throw new Error(t("auth.password.mismatch") ?? "Passwords do not match");
    }
    if (password.length < 6) {
      throw new Error(t("settings.account.security.passwordTooShort"));
    }
    await changePassword(password);
    props.onDone();
  }, [password, confirmPassword, props, t]);

  return (
    <div className="space-y-4">
      <AuthInputBox
        label={
          props.isAdd
            ? t("settings.account.security.newPasswordLabel")
            : (t("auth.password.passwordLabel") ?? "New password")
        }
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
      {result.error ? (
        <p className="text-authentication-errorText">{result.error.message}</p>
      ) : null}
      <Button
        theme="purple"
        loading={result.loading}
        disabled={!password || !confirmPassword}
        onClick={() => execute()}
      >
        {props.isAdd
          ? t("settings.account.security.addPasswordSubmit")
          : t("settings.account.security.changePasswordSubmit")}
      </Button>
    </div>
  );
}

function ProviderRow(props: {
  icon: Icons;
  label: string;
  connected: boolean;
  canDisconnect: boolean;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Icon icon={props.icon} className="text-xl" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-white">{props.label}</p>
          <p className="text-sm text-type-secondary">
            {props.connected
              ? t("settings.account.security.providerConnected")
              : t("settings.account.security.providerNotConnected")}
          </p>
        </div>
      </div>
      {props.connected ? (
        <Button
          theme="secondary"
          className="shrink-0 sm:min-w-[8.5rem]"
          loading={props.loading}
          disabled={!props.canDisconnect}
          onClick={props.onDisconnect}
        >
          {t("settings.account.security.disconnectProvider")}
        </Button>
      ) : (
        <Button
          theme="purple"
          className="shrink-0 sm:min-w-[8.5rem]"
          loading={props.loading}
          onClick={props.onConnect}
        >
          {t("settings.account.security.connectProvider")}
        </Button>
      )}
    </div>
  );
}

export function AccountSecurityPart(props: {
  account: AccountWithToken;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const statusResult = useAsync(async () => {
    return getAuthStatus("", props.account.token);
  }, [props.account.token, props.account.userId, refreshKey]);

  const refreshStatus = () => {
    setRefreshKey((value) => value + 1);
    props.onRefresh?.();
  };

  const [googleResult, connectGoogle] = useAsyncFn(async () => {
    await linkGoogleAccount();
  }, []);

  const [discordResult, connectDiscord] = useAsyncFn(async () => {
    await linkDiscordAccount();
  }, []);

  const [unlinkGoogleResult, disconnectGoogle] = useAsyncFn(async () => {
    await unlinkOAuthAccount("google");
    refreshStatus();
  }, [props.onRefresh]);

  const [unlinkDiscordResult, disconnectDiscord] = useAsyncFn(async () => {
    await unlinkOAuthAccount("discord");
    refreshStatus();
  }, [props.onRefresh]);

  const status = statusResult.value;
  if (statusResult.loading || !status) return null;

  const canAddPassword = Boolean(status.email) && !status.hasEmailIdentity;
  const canChangePassword = status.hasEmailIdentity || canAddPassword;

  return (
    <div id="settings-account-security" className="pt-8">
      <Heading2 border className="mb-6">
        {t("settings.account.security.title")}
      </Heading2>

      <div className="space-y-4">
        <SettingsCard>
          <div className="space-y-3">
            <h3 className="font-bold text-white">
              {t("settings.account.security.emailTitle")}
            </h3>
            {showEmailForm ? (
              <ChangeEmailForm
                currentEmail={status.email}
                onDone={() => setShowEmailForm(false)}
              />
            ) : (
              <>
                <Paragraph className="!mt-0 text-sm">
                  {status.email
                    ? t("settings.account.security.emailSignedIn", {
                        email: status.email,
                      })
                    : t("settings.account.security.emailMissing")}
                </Paragraph>
                <Button theme="secondary" onClick={() => setShowEmailForm(true)}>
                  {t("settings.account.security.changeEmailAction")}
                </Button>
              </>
            )}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="space-y-3">
            <h3 className="font-bold text-white">
              {t("settings.account.security.passwordTitle")}
            </h3>
            {showPasswordForm ? (
              <ChangePasswordForm
                isAdd={canAddPassword}
                onDone={() => {
                  setShowPasswordForm(false);
                  refreshStatus();
                }}
              />
            ) : canChangePassword ? (
              <>
                <Paragraph className="!mt-0 text-sm">
                  {canAddPassword
                    ? t("settings.account.security.addPasswordDescription")
                    : t("settings.account.security.passwordSetGeneric")}
                </Paragraph>
                <Button theme="secondary" onClick={() => setShowPasswordForm(true)}>
                  {canAddPassword
                    ? t("settings.account.security.addPasswordAction")
                    : t("settings.account.security.changePasswordAction")}
                </Button>
              </>
            ) : (
              <Paragraph className="!mt-0 text-sm">
                {t("settings.account.security.passwordNeedsEmail")}
              </Paragraph>
            )}
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-white">
                {t("settings.account.security.connectedTitle")}
              </h3>
              <Paragraph className="!mt-2 text-sm">
                {t("settings.account.security.connectedDescription")}
              </Paragraph>
              {!status.canUnlinkProvider &&
              (status.isGoogle || status.isDiscord) ? (
                <Paragraph className="!mt-2 text-xs text-type-secondary">
                  {t("settings.account.security.cannotUnlinkLast")}
                </Paragraph>
              ) : null}
            </div>

            <ProviderRow
              icon={Icons.GOOGLE}
              label={t("settings.account.security.googleProvider")}
              connected={status.isGoogle}
              canDisconnect={status.canUnlinkProvider}
              loading={googleResult.loading || unlinkGoogleResult.loading}
              onConnect={() => connectGoogle()}
              onDisconnect={() => disconnectGoogle()}
            />

            <div className="border-t border-settings-card-border/60 pt-4">
              <ProviderRow
                icon={Icons.DISCORD}
                label={t("settings.account.security.discordProvider")}
                connected={status.isDiscord}
                canDisconnect={status.canUnlinkProvider}
                loading={discordResult.loading || unlinkDiscordResult.loading}
                onConnect={() => connectDiscord()}
                onDisconnect={() => disconnectDiscord()}
              />
            </div>

            {googleResult.error || discordResult.error ? (
              <p className="text-authentication-errorText">
                {(googleResult.error ?? discordResult.error)?.message}
              </p>
            ) : null}
            {unlinkGoogleResult.error || unlinkDiscordResult.error ? (
              <p className="text-authentication-errorText">
                {(unlinkGoogleResult.error ?? unlinkDiscordResult.error)?.message}
              </p>
            ) : null}
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
