import { useEffect, useState } from "react";

import { FooterView } from "@/components/layout/Footer";
import { Navigation } from "@/components/layout/Navigation";
import { useIsMobile } from "@/hooks/useIsMobile";

export function HomeLayout(props: {
  showBg: boolean;
  /** Classic hero wants the lightbar; Featured carousel does not. */
  showLightbar?: boolean;
  /** Hide sticky nav search when the page hero already owns a large search. */
  showNavSearch?: boolean;
  children: React.ReactNode;
}) {
  const { isMobile } = useIsMobile();
  const [clearBackground, setClearBackground] = useState(true);
  const showLightbar = props.showLightbar ?? false;
  const showNavSearch = props.showNavSearch ?? true;

  useEffect(() => {
    // Mobile content sits under the fixed nav immediately; clear much sooner
    // than desktop so titles don't bleed through the search bar.
    const clearUntil = isMobile ? 24 : showLightbar ? 120 : 600;
    const handleScroll = () => {
      setClearBackground(window.scrollY < clearUntil);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isMobile, showLightbar]);

  return (
    <FooterView>
      <Navigation
        bg
        clearBackground={clearBackground}
        noLightbar={!showLightbar}
        showSearch={showNavSearch}
      />
      {props.children}
    </FooterView>
  );
}
