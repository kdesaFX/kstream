import { useEffect, useState } from "react";

import { FooterView } from "@/components/layout/Footer";
import { Navigation } from "@/components/layout/Navigation";

export function HomeLayout(props: {
  showBg: boolean;
  children: React.ReactNode;
}) {
  const [clearBackground, setClearBackground] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setClearBackground(window.scrollY < 600);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
