import { ReactNode } from "react";

import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";
import { useBannerSize, useBannerStore } from "@/stores/banner";
import { BannerLocation } from "@/stores/banner/BannerLocation";

export function Layout(props: { children: ReactNode }) {
  const bannerSize = useBannerSize();
  const location = useBannerStore((s) => s.location);

  return (
    <div>
      <DesktopTitleBar />
      <div className="kstream-desktop-banner fixed inset-x-0 z-[1000]">
        <BannerLocation />
      </div>
      <div
        style={{
          paddingTop: location === null ? `${bannerSize}px` : "0px",
        }}
        className="flex min-h-screen flex-col"
      >
        {props.children}
      </div>
    </div>
  );
}
