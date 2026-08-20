import { useNavigate } from "react-router-dom";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { RegisterCredentialsPart } from "@/pages/parts/auth/RegisterCredentialsPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";

export function RegisterPage() {
  const navigate = useNavigate();

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
