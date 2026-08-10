import { isExtensionActive } from "@/backend/extension/messaging";
import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";

/** Mobile / in-app browsers can't install the extension — skip setup there. */
export function isMobileOnboardingClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS desktop UA still has touch
  return ua.includes("Mac") && "ontouchend" in document;
}

export async function needsOnboarding(): Promise<boolean> {
  // if onboarding is dislabed, no onboarding needed
  if (!conf().HAS_ONBOARDING) return false;

  // Phones/tablets can't run the extension; use default proxy path silently.
  if (isMobileOnboardingClient()) {
    const store = useOnboardingStore.getState();
    if (!store.completed) store.setCompleted(true);
    return false;
  }

  // if extension is active and working, no onboarding needed
  const extensionActive = await isExtensionActive();
  if (extensionActive) return false;

  // if there is any custom proxy urls, no onboarding needed
  const proxyUrls = useAuthStore.getState().proxySet;
  if (proxyUrls) return false;

  // if onboarding has been completed, no onboarding needed
  const completed = useOnboardingStore.getState().completed;
  if (completed) return false;

  return true;
}
