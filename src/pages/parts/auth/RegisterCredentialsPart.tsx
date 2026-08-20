import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsyncFn } from "react-use";

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
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";
import { useWatchHistoryStore } from "@/stores/watchHistory";

interface RegisterCredentialsPartProps {
  userData: AccountProfile;
  onNext?: () => void;
}

export function RegisterCredentialsPart(props: RegisterCredentialsPartProps) {
  const { t } = useTranslation();
  const { register, loginWithGoogle, restore, importData } = useAuth();
  const progressItems = useProgressStore((store) => store.items);
  const bookmarkItems = useBookmarkStore((store) => store.bookmarks);
  const watchHistoryItems = useWatchHistoryStore((store) => store.items);
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
        device: props.userData.device,
        profile: props.userData.profile,
        nickname: validatedEmail.split("@")[0],
      },
    });
    await importData(account, progressItems, bookmarkItems, watchHistoryItems, false);
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
    t,
  ]);

  const [googleResult, doGoogle] = useAsyncFn(async () => {
    await loginWithGoogle();
  }, [loginWithGoogle]);

  return (
    <LargeCard>
      <LargeCardText
        icon={<Icon icon={Icons.USER} />}
        title={t("auth.password.registerTitle") ?? "Create your account"}
      >
        {t("auth.password.registerDescription") ??
          "Enter your email and password to finish signing up."}
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
      {(registerResult.error || googleResult.error) && (
        <p className="mt-3 text-authentication-errorText">
          {registerResult.error?.message ?? googleResult.error?.message}
        </p>
      )}
      <LargeCardButtons>
        <Button
          theme="purple"
          loading={registerResult.loading}
          disabled={
            googleResult.loading ||
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
          disabled={registerResult.loading}
          onClick={() => doGoogle()}
          className="w-full"
        >
          {t("auth.login.google") ?? "Continue with Google"}
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
