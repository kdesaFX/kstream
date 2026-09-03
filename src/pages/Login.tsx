import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/auth/useAuth";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { AuthUnavailablePart } from "@/pages/parts/auth/AuthUnavailablePart";
import { LoginFormPart } from "@/pages/parts/auth/LoginFormPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { AUTH_TEMPORARILY_UNAVAILABLE } from "@/setup/authAvailability";

export function LoginPage() {
  const navigate = useNavigate();
  const { loggedIn } = useAuth();

  useEffect(() => {
    if (loggedIn) navigate("/", { replace: true });
  }, [loggedIn, navigate]);

  if (loggedIn) return null;

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.login" />
      {AUTH_TEMPORARILY_UNAVAILABLE ? (
        <AuthUnavailablePart />
      ) : (
        <LoginFormPart
          onLogin={() => {
            navigate("/");
          }}
        />
      )}
    </SubPageLayout>
  );
}
