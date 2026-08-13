import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { isDesktopApp } from "@/hooks/useIsDesktopApp";
import { useQueryParam } from "@/hooks/useQueryParams";
import { useOnboardingStore } from "@/stores/onboarding";
import { isMobileOnboardingClient } from "@/utils/hosting/onboarding";

export function useRedirectBack() {
  const [url] = useQueryParam("redirect");
  const navigate = useNavigate();
  const setCompleted = useOnboardingStore((s) => s.setCompleted);

  const redirectBack = useCallback(() => {
    navigate(url ?? "/");
  }, [navigate, url]);

  const completeAndRedirect = useCallback(() => {
    setCompleted(true);
    redirectBack();
  }, [redirectBack, setCompleted]);

  return { completeAndRedirect };
}

export function useNavigateOnboarding() {
  const navigate = useNavigate();
  const loc = useLocation();
  const nav = useCallback(
    (path: string) => {
      navigate({
        pathname: path,
        search: loc.search,
      });
    },
    [navigate, loc],
  );
  return nav;
}

export function useSkipOnboarding(): boolean {
  const { completeAndRedirect } = useRedirectBack();
  const shouldSkip = isDesktopApp() || isMobileOnboardingClient();

  useEffect(() => {
    if (shouldSkip) completeAndRedirect();
  }, [completeAndRedirect, shouldSkip]);

  return shouldSkip;
}
