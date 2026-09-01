import { Trans, useTranslation } from "react-i18next";
import { useEffect } from "react";

import { Icon, Icons } from "@/components/Icon";
import { Stepper } from "@/components/layout/Stepper";
import { BiggerCenterContainer } from "@/components/layout/ThinContainer";
import { VerticalLine } from "@/components/layout/VerticalLine";
import {
  FancyModal,
  useModal,
} from "@/components/overlays/Modal";
import { useDownloadModal } from "@/components/overlays/downloadModal";
import { Divider } from "@/components/utils/Divider";
import { Ol } from "@/components/utils/Ol";
import {
  Heading2,
  Heading3,
  Paragraph,
} from "@/components/utils/Text";
import { MinimalPageLayout } from "@/pages/layouts/MinimalPageLayout";
import {
  useNavigateOnboarding,
  useRedirectBack,
} from "@/pages/onboarding/onboardingHooks";
import {
  Card,
  CardContent,
  Link,
  MiniCardContent,
} from "@/pages/onboarding/utils";
import { PageTitle } from "@/pages/parts/util/PageTitle";
import { conf } from "@/setup/config";
import { usePreferencesStore } from "@/stores/preferences";
import { isMobileOnboardingClient, isWindowsDesktopClient } from "@/utils/hosting/onboarding";
import { HomeAd } from "@/pages/parts/home/HomeAd";

import { DebridEdit, FebboxSetup } from "../parts/settings/ConnectionsPart";

function Item(props: { title: string; children: React.ReactNode }) {
  return (
    <>
      <p className="text-white mb-2 font-medium">{props.title}</p>
      <div className="text-type-text">{props.children}</div>
    </>
  );
}

export function OnboardingPage() {
  const navigate = useNavigateOnboarding();
  const infoModal = useModal("info");
  const { openDownloadModal } = useDownloadModal();
  const { completeAndRedirect } = useRedirectBack();
  const { t } = useTranslation();
  const showDesktopApp = isWindowsDesktopClient();

  const febboxKey = usePreferencesStore((s) => s.febboxKey);
  const setFebboxKey = usePreferencesStore((s) => s.setFebboxKey);
  const debridToken = usePreferencesStore((s) => s.debridToken);
  const setdebridToken = usePreferencesStore((s) => s.setdebridToken);
  const debridService = usePreferencesStore((s) => s.debridService);
  const setdebridService = usePreferencesStore((s) => s.setdebridService);

  // Mobile can't run desktop setup — finish immediately.
  useEffect(() => {
    if (isMobileOnboardingClient()) completeAndRedirect();
  }, [completeAndRedirect]);

  if (isMobileOnboardingClient()) return null;

  return (
    <MinimalPageLayout>
      <PageTitle subpage k="global.pages.onboarding" />
      <FancyModal
        id={infoModal.id}
        title={t("onboarding.start.moreInfo.title")}
        size="xl"
      >
        <Trans
          i18nKey="onboarding.start.moreInfo.explainer.intro"
          className="pb-4"
        />
        <div className="flex flex-col gap-4 md:flex-row py-8">
          <div className="md:w-1/2">
            <Heading3 className="font-normal">
              <Trans i18nKey="onboarding.start.moreInfo.recommended.title" />
            </Heading3>
            <Trans i18nKey="onboarding.start.moreInfo.recommended.subtitle" />
            <div className="space-y-4 pt-8 bg-mediaCard-hoverAccent/10 rounded-xl p-10 mt-6 mr-2 min-w-[20rem]">
              <Item
                title={t("onboarding.start.moreInfo.recommended.desktop.title")}
              >
                <Trans i18nKey="onboarding.start.moreInfo.recommended.desktop.description" />
              </Item>
              <Item
                title={t("onboarding.start.moreInfo.recommended.iOS.title")}
              >
                <Trans i18nKey="onboarding.start.moreInfo.recommended.iOS.description" />
              </Item>
              <Item
                title={t("onboarding.start.moreInfo.recommended.android.title")}
              >
                <Trans i18nKey="onboarding.start.moreInfo.recommended.android.description" />
              </Item>
            </div>
          </div>
          <div className="inline md:hidden">
            <Divider />
          </div>
          <div>
            <Ol
              items={[
                <Item title={t("onboarding.start.moreInfo.explainer.browser")}>
                  {t("onboarding.start.moreInfo.explainer.browserDescription")}
                </Item>,
                <Item title={t("onboarding.start.moreInfo.explainer.extension")}>
                  {t(
                    "onboarding.start.moreInfo.explainer.extensionDescription",
                  )}
                </Item>,
                <Item title={t("onboarding.start.moreInfo.explainer.proxy")}>
                  {t("onboarding.start.moreInfo.explainer.proxyDescription")}
                </Item>,
              ].filter(Boolean)}
            />
            {conf().ALLOW_FEBBOX_KEY && (
              <div className="pt-12 pl-[3.2rem]">
                <Item
                  title={t("onboarding.start.moreInfo.explainer.fedapi.fedapi")}
                >
                  {t(
                    "onboarding.start.moreInfo.explainer.fedapi.fedapiDescription",
                  )}
                  <p className="mt-2 text-sm italic opacity-75">
                    {t("fedapi.onboarding.note")}
                  </p>
                </Item>
              </div>
            )}
          </div>
        </div>
        <div>
          <p className="text-type-secondary">
            {t("onboarding.start.moreInfo.explainer.outro")}
          </p>
        </div>
      </FancyModal>
      <BiggerCenterContainer>
        <Stepper steps={2} current={1} className="mb-12" />
        <Heading2 className="!mt-0 !text-3xl">
          {t("onboarding.start.title")}
        </Heading2>
        <Paragraph className="max-w-[360px]">
          {t("onboarding.start.explainer")}
          <div
            className="pt-4 flex cursor-pointer items-center text-type-link"
            onClick={() => infoModal.show()}
          >
            <Trans i18nKey="onboarding.start.moreInfo.button" />
            <Icon className="pl-2" icon={Icons.CIRCLE_QUESTION} />
          </div>
        </Paragraph>

        {/* Desktop Cards */}
        <div className="hidden md:flex w-full flex-row gap-3 pb-2">
          {showDesktopApp ? (
            <>
              <Card onClick={() => openDownloadModal()} className="w-1/2">
                <CardContent
                  colorClass="!text-onboarding-good"
                  title={t("onboarding.start.options.desktopapp.title")}
                  subtitle={t("onboarding.start.options.desktopapp.quality")}
                  description={t(
                    "onboarding.start.options.desktopapp.description",
                  )}
                >
                  <Link className="!text-onboarding-good">
                    {t("onboarding.start.options.desktopapp.action")}
                  </Link>
                </CardContent>
              </Card>
              <div className="hidden md:grid grid-rows-[1fr,auto,1fr] justify-center gap-4">
                <VerticalLine className="items-end" />
                <span className="text-xs uppercase font-bold">
                  {t("onboarding.start.options.or")}
                </span>
                <VerticalLine />
              </div>
            </>
          ) : null}
          <Card
            onClick={() => completeAndRedirect()}
            className={showDesktopApp ? "w-1/2" : "w-full"}
          >
            <CardContent
              colorClass="!text-onboarding-best"
              title={t("onboarding.start.options.browser.title")}
              subtitle={t("onboarding.start.options.browser.quality")}
              description={t("onboarding.start.options.browser.description")}
            >
              <Link className="!text-onboarding-best">
                {t("onboarding.start.options.browser.action")}
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex w-full flex-col gap-3 pb-2">
          {showDesktopApp ? (
            <Card onClick={() => openDownloadModal()} className="w-full">
              <MiniCardContent
                colorClass="!text-onboarding-good"
                title={t("onboarding.start.options.desktopapp.title")}
                subtitle={t("onboarding.start.options.desktopapp.quality")}
                description={t(
                  "onboarding.start.options.desktopapp.description",
                )}
              />
            </Card>
          ) : null}
          <Card onClick={() => completeAndRedirect()} className="w-full">
            <MiniCardContent
              colorClass="!text-onboarding-best"
              title={t("onboarding.start.options.browser.title")}
              subtitle={t("onboarding.start.options.browser.quality")}
              description={t("onboarding.start.options.browser.description")}
            />
          </Card>
        </div>

        <p className="text-sm text-type-secondary pb-6">
          <Trans
            i18nKey="onboarding.start.options.extension.advancedLink"
            components={{
              link: (
                <button
                  type="button"
                  className="text-type-link hover:underline"
                  onClick={() => navigate("/onboarding/extension")}
                />
              ),
            }}
          />
        </p>

        {(conf().ALLOW_FEBBOX_KEY || conf().ALLOW_DEBRID_KEY) === true && (
          <Heading3 className="text-white font-bold mb-3 mt-6">
            {t("onboarding.start.options.addons.title")}
          </Heading3>
        )}
        <div className="mt-6">
          <FebboxSetup
            febboxKey={febboxKey}
            setFebboxKey={setFebboxKey}
            mode="onboarding"
          />
        </div>
        <div className="mt-6">
          <DebridEdit
            debridToken={debridToken}
            setdebridToken={setdebridToken}
            debridService={debridService}
            setdebridService={setdebridService}
            mode="onboarding"
          />
        </div>
        <HomeAd slot="onboarding" />
      </BiggerCenterContainer>
    </MinimalPageLayout>
  );
}
