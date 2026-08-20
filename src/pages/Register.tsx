import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { RegisterCredentialsPart } from "@/pages/parts/auth/RegisterCredentialsPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { useAuth } from "@/hooks/auth/useAuth";

export function RegisterPage() {
  const navigate = useNavigate();
  const { loggedIn } = useAuth();

  useEffect(() => {
    if (loggedIn) navigate("/", { replace: true });
  }, [loggedIn, navigate]);

  if (loggedIn) return null;

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.register" />
      <RegisterCredentialsPart
        onNext={() => {
          navigate("/");
        }}
      />
    </SubPageLayout>
  );
}
