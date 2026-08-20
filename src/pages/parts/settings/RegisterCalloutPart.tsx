import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { SolidSettingsCard } from "@/components/layout/SettingsCard";
import { Heading3 } from "@/components/utils/Text";

export function RegisterCalloutPart() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div>
      <SolidSettingsCard
        paddingClass="px-6 py-12"
        className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mt-5"
      >
        <div>
          <Heading3>{t("settings.account.register.title")}</Heading3>
          <p className="text-type-text max-w-[30rem]">
            {t("settings.account.register.text")}
          </p>
        </div>
        <div className="flex flex-wrap justify-end items-center gap-3">
          <Button theme="secondary" onClick={() => navigate("/login")}>
            {t("settings.account.register.login")}
          </Button>
          <Button theme="purple" onClick={() => navigate("/register")}>
            {t("settings.account.register.cta")}
          </Button>
        </div>
      </SolidSettingsCard>
    </div>
  );
}
