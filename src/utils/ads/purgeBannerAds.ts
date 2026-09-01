const AD_SCRIPT_HOST_RE =
  /(?:profitableratecpmnetwork|highrevenueformat|adsterra|effectivegatecpm|clickadu|onclick|pemsrv|revenuecpmnetwork)\./i;

/** Tear down Adsterra banner scripts/iframes when leaving home for the player. */
export function purgeBannerAds(): void {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll<HTMLScriptElement>("script[src]")
    .forEach((node) => {
      const src = node.getAttribute("src") ?? "";
      if (AD_SCRIPT_HOST_RE.test(src)) node.remove();
    });

  document.querySelectorAll("[data-kstream-ad-slot]").forEach((node) => {
    node.replaceChildren();
  });

  try {
    delete window.atOptions;
  } catch {
    window.atOptions = undefined;
  }
}
