import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsync, useAsyncFn } from "react-use";

import { getAuthStatus } from "@/backend/accounts/auth";
import { changePassword } from "@/backend/supabase/data";
import { Button } from "@/components/buttons/Button";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { Heading2, Paragraph } from "@/components/utils/Text";
import { useAuth } from "@/hooks/auth/useAuth";
import { AccountWithToken } from "@/stores/auth";

function ChangePasswordForm(props: { onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [result, execute] = useAsyncFn(async () => {
    if (password !== confirmPassword) {
      throw new Error(t("auth.password.mismatch") ?? "Passwords do not match");
    }
    if (password.length < 6) {
      throw new Error(
        t("settings.account.security.passwordTooShort") ??
          "Password must be at least 6 characters",
      );
    }
    await changePassword(password);
    props.onDone();
  }, [password, confirmPassword, props, t]);

  return (
    <div className="space-y-4">
      <AuthInputBox
        label={t("auth.password.passwordLabel") ?? "New password"}
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
        {t("settings.account.security.changePasswordSubmit") ?? "Change password"}
      </Button>
    </div>
  );
}

export function AccountSecurityPart(props: { account: AccountWithToken }) {
  const { t } = useTranslation();
  const { signOutEverywhere } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const statusResult = useAsync(async () => {
    return getAuthStatus("", props.account.token);
  }, [props.account.token, props.account.userId]);

  const [signOutResult, executeSignOutEverywhere] = useAsyncFn(async () => {
    await signOutEverywhere();
    window.location.href = "/login";
  }, [signOutEverywhere]);

  const status = statusResult.value;
  if (statusResult.loading || !status) return null;

  const isGoogle = status.isGoogle;
  const isDiscord = status.isDiscord;
  const isOAuthOnly = isGoogle || isDiscord;

  return (
    <div id="settings-account-security" className="pt-6">
      <Heading2 border className="mb-6">
        {t("settings.account.security.title") ?? "Account Security"}
      </Heading2>

      <SettingsCard className="mb-4">
        <div className="space-y-3">
          <h3 className="font-bold text-white">
            {t("settings.account.security.passwordTitle") ?? "Password"}
          </h3>
          {isOAuthOnly ? (
            <Paragraph className="!mt-0 text-sm">
              {isDiscord
                ? (t("settings.account.security.discordLinked") ??
                  "This account uses Discord sign-in. Password changes are managed through Discord.")
                : (t("settings.account.security.googleLinked") ??
                  "This account uses Google sign-in. Password changes are managed through Google.")}
            </Paragraph>
          ) : showPasswordForm ? (
            <ChangePasswordForm onDone={() => setShowPasswordForm(false)} />
          ) : (
            <>
              <Paragraph className="!mt-0 text-sm">
                {status.email
                  ? (t("settings.account.security.emailSignedIn", {
                      email: status.email,
                    }) ?? `Signed in as ${status.email}`)
                  : (t("settings.account.security.passwordSetGeneric") ??
                    "You can change your account password here.")}
              </Paragraph>
              <Button theme="secondary" onClick={() => setShowPasswordForm(true)}>
                {t("settings.account.security.changePasswordAction") ??
                  "Change password"}
              </Button>
            </>
          )}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="space-y-3">
          <h3 className="font-bold text-white">
            {t("settings.account.security.sessionsTitle") ?? "Sessions"}
          </h3>
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
