import classNames from "classnames";

import { ThinContainer } from "@/components/layout/ThinContainer";
import { Heading1, Paragraph } from "@/components/utils/Text";
import { PageTitle } from "@/pages/parts/util/PageTitle";

import { SubPageLayout } from "./layouts/SubPageLayout";


function Button(props: {
  className: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={classNames(
        "font-bold rounded h-10 w-40 scale-90 hover:scale-95 transition-all duration-200",
        props.className,
      )}
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function CelPage() {
  return (
    <SubPageLayout>
      <PageTitle subpage k="global.pages.cel" />
      <ThinContainer>
        <Heading1>Mükemmel bi&apos; film tadında</Heading1>
        <Paragraph className="flex flex-col gap-6">
          <span style={{ color: "#cfcfcf" }}>
            sen ve ben, karanlıkta - onca yıldızın içinde
          </span>
        </Paragraph>
      </ThinContainer>
    </SubPageLayout>
  );
}
