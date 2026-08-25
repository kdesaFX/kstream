import { lazyWithPreload } from "react-lazy-with-preload";

const PlayerView = lazyWithPreload(() => import("@/pages/PlayerView"));
const SettingsPage = lazyWithPreload(() => import("@/pages/Settings"));

/** Preload heavy routes on intent — not at boot (competes with home LCP). */
export function preloadPlayerView() {
  void PlayerView.preload();
}

export function preloadSettingsPage() {
  void SettingsPage.preload();
}

export { PlayerView, SettingsPage };
