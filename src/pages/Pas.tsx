import { Trans, useTranslation } from "react-i18next";

import { ThinContainer } from "@/components/layout/ThinContainer";
import { Heading1, Paragraph } from "@/components/utils/Text";
import { PageTitle } from "@/pages/parts/util/PageTitle";

import { SubPageLayout } from "./layouts/SubPageLayout";

export function PasPage() {
  const { t } = useTranslation();

  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.pas" />
      <ThinContainer>
        <Heading1>{t("pas.title")}</Heading1>
        <Paragraph className="flex flex-col gap-6">
          <Trans
            i18nKey="pas.text"
            components={{
              bold: <span className="font-bold" style={{ color: "#cfcfcf" }} />,
            }}
          />
        </Paragraph>
      </ThinContainer>
    </SubPageLayout>
  );
}
