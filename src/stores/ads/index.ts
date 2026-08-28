import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { isDesktopApp } from "@/hooks/useIsDesktopApp";
import { isMobileViewport } from "@/hooks/useIsMobile";

export interface AdsStore {
  adsDisabled: boolean;
  disableAds(): void;
  enableAds(): void;
}

/** Secret toggle, desktop shell, and mobile viewports — no ad scripts/iframes. */
export function areAdsBlocked(adsDisabled: boolean): boolean {
  return adsDisabled || isDesktopApp() || isMobileViewport();
}

export const useAdsStore = create(
  persist(
    immer<AdsStore>((set) => ({
      adsDisabled: false,
      disableAds() {
        set((s) => {
          s.adsDisabled = true;
        });
      },
      enableAds() {
        set((s) => {
          s.adsDisabled = false;
        });
      },
    })),
    {
      name: "__MW::ads",
    },
  ),
);
