import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { BrandPill } from "@/components/layout/BrandPill";
import { LargeCard, LargeCardButtons, LargeCardText } from "@/components/layout/LargeCard";

export function AuthUnavailablePart() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <LargeCard top={<BrandPill backgroundClass="bg-[#161527]" />}>
      <LargeCardText title={t("auth.unavailable.title")}>
        {t("auth.unavailable.description")}
      </LargeCardText>
      <LargeCardButtons>
        <Button theme="purple" onClick={() => navigate("/")}>
          {t("auth.unavailable.home")}
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
