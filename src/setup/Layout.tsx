import { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import {
  MobileBottomNav,
  MOBILE_BOTTOM_NAV_PADDING,
  shouldShowMobileBottomNav,
} from "@/components/layout/MobileBottomNav";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBannerSize, useBannerStore } from "@/stores/banner";
import { BannerLocation } from "@/stores/banner/BannerLocation";

export function Layout(props: { children: ReactNode }) {
  const bannerSize = useBannerSize();
  const location = useLocation();
  const { isMobile } = useIsMobile();
  const bannerLocation = useBannerStore((s) => s.location);
  const padForBottomNav =
    isMobile && shouldShowMobileBottomNav(location.pathname);

  return (
    <div>
      <div className="fixed inset-x-0 z-[1000]">
        <BannerLocation />
      </div>
      <div
        style={{
          paddingTop: bannerLocation === null ? `${bannerSize}px` : "0px",
        }}
        className={[
          "flex min-h-screen flex-col",
          padForBottomNav ? MOBILE_BOTTOM_NAV_PADDING : "",
        ].join(" ")}
      >
        {props.children}
      </div>
      <MobileBottomNav />
    </div>
  );
}
