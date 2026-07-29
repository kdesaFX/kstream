import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsync, useAsyncFn } from "react-use";

import { getAuthStatus } from "@/backend/accounts/auth";
import { isPasskeySupported } from "@/backend/accounts/crypto";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { Heading2, Paragraph } from "@/components/utils/Text";
import { useAuth } from "@/hooks/auth/useAuth";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { AccountWithToken } from "@/stores/auth";

function AddOrMigrateForm(props: {
  mode: "migrate" | "add";
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { migrateToPassword, addPassword } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [result, execute] = useAsyncFn(async () => {
    if (password !== confirmPassword) {
      throw new Error(t("auth.password.mismatch") ?? "Passwords do not match");
    }
    if (props.mode === "migrate") {
      await migrateToPassword(username, password);
    } else {
      await addPassword(username, password);
    }
    props.onDone();
  }, [props, migrateToPassword, addPassword, username, password, confirmPassword]);

  return (
    <div className="space-y-4">
      <AuthInputBox
        label={t("auth.password.usernameLabel") ?? "Username"}
        autoComplete="username"
        name="username"
        value={username}
        onChange={setUsername}
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
      {result.error ? (
        <p className="text-authentication-errorText">{result.error.message}</p>
      ) : null}
      <Button
        theme="purple"
        loading={result.loading}
        disabled={!username.trim() || !password || !confirmPassword}
        onClick={() => execute()}
      >
        {props.mode === "migrate"
          ? t("settings.account.security.migrateSubmit") ?? "Switch to username & password"
          : t("settings.account.security.addPasswordSubmit") ?? "Add password"}
      </Button>
    </div>
  );
}

export function AccountSecurityPart(props: { account: AccountWithToken }) {
  const { t } = useTranslation();
  const url = useBackendUrl();
  const { addPasskey } = useAuth();
  const [showMigrateForm, setShowMigrateForm] = useState(false);
  const [showAddPasswordForm, setShowAddPasswordForm] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const statusResult = useAsync(async () => {
    if (!url) return null;
    return getAuthStatus(url, props.account.token);
  }, [url, props.account.token, props.account.userId, refreshCount]);

  const [addPasskeyResult, executeAddPasskey] = useAsyncFn(async () => {
    await addPasskey(newDeviceName.trim() || "New passkey");
    setRefreshCount((v) => v + 1);
  }, [addPasskey, newDeviceName]);

  const status = statusResult.value;
  if (statusResult.loading || !status) return null;

  return (
    <div id="settings-account-security" className="pt-6">
      <Heading2 border className="mb-6">
        {t("settings.account.security.title") ?? "Account Security"}
      </Heading2>

      {status.isLegacyPassphrase ? (
        <SettingsCard className="mb-4">
          <div className="space-y-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Icon icon={Icons.CIRCLE_EXCLAMATION} className="text-type-danger" />
              {t("settings.account.security.migrateTitle") ??
                "Your account still uses a recovery phrase"}
            </h3>
            <Paragraph className="!mt-0 text-sm">
              {t("settings.account.security.migrateDescription") ??
                "Switch to a username and password so you don't have to keep track of a 12-word phrase."}
            </Paragraph>
            {showMigrateForm ? (
              <AddOrMigrateForm
                mode="migrate"
                onDone={() => {
                  setShowMigrateForm(false);
                  setRefreshCount((v) => v + 1);
                }}
              />
            ) : (
              <Button theme="purple" onClick={() => setShowMigrateForm(true)}>
                {t("settings.account.security.migrateAction") ??
                  "Switch to username & password"}
              </Button>
            )}
          </div>
        </SettingsCard>
      ) : null}

      <SettingsCard className="mb-4">
        <div className="space-y-3">
          <h3 className="font-bold text-white">
            {t("settings.account.security.passwordTitle") ?? "Username & password"}
          </h3>
          {status.hasPassword ? (
            <Paragraph className="!mt-0 text-sm">
              {t("settings.account.security.passwordSet", {
                username: status.username,
              }) ?? `Signed in as ${status.username}`}
            </Paragraph>
          ) : showAddPasswordForm ? (
            <AddOrMigrateForm
              mode="add"
              onDone={() => {
                setShowAddPasswordForm(false);
                setRefreshCount((v) => v + 1);
              }}
            />
          ) : (
            <>
              <Paragraph className="!mt-0 text-sm">
                {t("settings.account.security.addPasswordDescription") ??
                  "Add a username and password so you can also log in that way."}
              </Paragraph>
              <Button
                theme="secondary"
                onClick={() => setShowAddPasswordForm(true)}
              >
                {t("settings.account.security.addPasswordAction") ?? "Add password"}
              </Button>
            </>
          )}
        </div>
      </SettingsCard>

      {isPasskeySupported() ? (
        <SettingsCard>
          <div className="space-y-3">
            <h3 className="font-bold text-white">
              {t("settings.account.security.passkeyTitle") ?? "Passkey"}
            </h3>
            {status.hasPasskey ? (
              <Paragraph className="!mt-0 text-sm">
                {t("settings.account.security.passkeySet") ??
                  "This account has a passkey linked."}
              </Paragraph>
            ) : (
              <>
                <Paragraph className="!mt-0 text-sm">
                  {t("settings.account.security.addPasskeyDescription") ??
                    "Add a passkey for a faster, no-password sign in on this device."}
                </Paragraph>
                <AuthInputBox
                  label={t("auth.deviceNameLabel") ?? undefined}
                  value={newDeviceName}
                  onChange={setNewDeviceName}
                  placeholder={t("auth.deviceNamePlaceholder") ?? undefined}
                />
                {addPasskeyResult.error ? (
                  <p className="text-authentication-errorText">
                    {addPasskeyResult.error.message}
                  </p>
                ) : null}
                <Button
                  theme="secondary"
                  loading={addPasskeyResult.loading}
                  disabled={!newDeviceName.trim()}
                  onClick={() => executeAddPasskey()}
                >
                  {t("settings.account.security.addPasskeyAction") ?? "Add passkey"}
                </Button>
              </>
            )}
          </div>
        </SettingsCard>
      ) : null}
    </div>
  );
}
