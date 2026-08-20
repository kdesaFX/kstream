import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { LoginFormPart } from "@/pages/parts/auth/LoginFormPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { useAuth } from "@/hooks/auth/useAuth";

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
      <LoginFormPart
        onLogin={() => {
          navigate("/");
        }}
      />
    </SubPageLayout>
  );
}
