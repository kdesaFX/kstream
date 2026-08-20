import { useEffect, useState } from "react";

import { FooterView } from "@/components/layout/Footer";
import { Navigation } from "@/components/layout/Navigation";
import { useIsMobile } from "@/hooks/useIsMobile";

export function HomeLayout(props: {
  showBg: boolean;
  children: React.ReactNode;
}) {
  const { isMobile } = useIsMobile();
  const [clearBackground, setClearBackground] = useState(true);

  useEffect(() => {
    // Mobile content sits under the fixed nav immediately; clear much sooner
    // than desktop so titles don't bleed through the search bar.
    const clearUntil = isMobile ? 24 : 600;
    const handleScroll = () => {
      setClearBackground(window.scrollY < clearUntil);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isMobile]);

  return (
    <FooterView>
      <Navigation
        bg
        clearBackground={clearBackground}
        noLightbar
        showSearch
      />
      {props.children}
    </FooterView>
  );
}
