import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import {
  AccountCreatePart,
  AccountProfile,
} from "@/pages/parts/auth/AccountCreatePart";
import { RegisterCredentialsPart } from "@/pages/parts/auth/RegisterCredentialsPart";
import { PageTitle } from "@/pages/parts/util/PageTitle";

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<null | AccountProfile>(null);

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.register" />
      {step === 0 ? (
        <AccountCreatePart
          onNext={(a) => {
            setAccount(a);
            setStep(1);
          }}
        />
      ) : null}
      {step === 1 && account ? (
        <RegisterCredentialsPart
          userData={account}
          onNext={() => {
            navigate("/");
          }}
        />
      ) : null}
    </SubPageLayout>
  );
}
