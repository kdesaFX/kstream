import { useTranslation } from "react-i18next";

import { FancyModal } from "./Modal";

export function SupportInfoModal({ id }: { id: string }) {
  const { t } = useTranslation();

  return (
    <FancyModal id={id} title={t("home.support.title")} size="md">
      <div className="space-y-4">
        <p className="text-type-secondary">{t("home.support.explanation")}</p>
        <div className="text-xs text-type-dimmed text-center">
          {t("home.support.thankYou")}
        </div>
      </div>
    </FancyModal>
  );
}
