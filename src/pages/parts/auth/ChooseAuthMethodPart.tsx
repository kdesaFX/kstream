import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

import { isPasskeySupported } from "@/backend/accounts/crypto";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { useAuth } from "@/hooks/auth/useAuth";
import { AccountProfile } from "@/pages/parts/auth/AccountCreatePart";

interface ChooseAuthMethodPartProps {
  userData: AccountProfile;
  onNext?: () => void;
}

type Method = "choose" | "password";

export function ChooseAuthMethodPart(props: ChooseAuthMethodPartProps) {
  const { t } = useTranslation();
  const { registerWithPasskey, registerWithPassword } = useAuth();
  const [method, setMethod] = useState<Method>("choose");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passkeyResult, doPasskeyRegister] = useAsyncFn(async () => {
    await registerWithPasskey(props.userData.device, props.userData.profile);
    props.onNext?.();
  }, [registerWithPasskey, props]);

  const [passwordResult, doPasswordRegister] = useAsyncFn(async () => {
    if (password !== confirmPassword) {
      throw new Error(t("auth.password.mismatch") ?? "Passwords do not match");
    }
    await registerWithPassword({
      username,
      password,
      device: props.userData.device,
      profile: props.userData.profile,
    });
    props.onNext?.();
  }, [registerWithPassword, username, password, confirmPassword, props]);

  if (method === "password") {
    return (
      <LargeCard>
        <LargeCardText
          icon={<Icon icon={Icons.USER} />}
          title={t("auth.password.registerTitle") ?? "Create your login"}
        >
          {t("auth.password.registerDescription") ??
            "Pick a username and password for your account."}
        </LargeCardText>
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
        </div>
        {passwordResult.error ? (
          <p className="mt-3 text-authentication-errorText">
            {passwordResult.error.message}
          </p>
        ) : null}
        <LargeCardButtons>
          <Button
            theme="purple"
            loading={passwordResult.loading}
            disabled={
              !username.trim() || !password || !confirmPassword
            }
            onClick={() => doPasswordRegister()}
          >
            {t("auth.register.information.next")}
          </Button>
          <Button theme="secondary" onClick={() => setMethod("choose")}>
            {t("auth.back") ?? "Back"}
          </Button>
        </LargeCardButtons>
      </LargeCard>
    );
  }

  return (
    <LargeCard>
      <LargeCardText
        icon={<Icon icon={Icons.CIRCLE_CHECK} />}
        title={t("auth.chooseMethod.title") ?? "How do you want to sign in?"}
      >
        {t("auth.chooseMethod.description") ??
          "Pick how you'll log back into this account."}
      </LargeCardText>
      {passkeyResult.error ? (
        <p className="mt-3 text-authentication-errorText">
          {passkeyResult.error.message}
        </p>
      ) : null}
      <LargeCardButtons>
        {isPasskeySupported() ? (
          <Button
            theme="purple"
            loading={passkeyResult.loading}
            onClick={() => doPasskeyRegister()}
          >
            <Icon icon={Icons.LOCK} className="mr-2" />
            {t("auth.chooseMethod.passkey") ?? "Use a passkey"}
          </Button>
        ) : null}
        <Button theme="secondary" onClick={() => setMethod("password")}>
          {t("auth.chooseMethod.password") ?? "Username & password"}
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
