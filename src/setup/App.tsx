import { ReactElement, Suspense, lazy, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { convertLegacyUrl, isLegacyUrl } from "@/backend/metadata/getmeta";
import { generateQuickSearchMediaUrl } from "@/backend/metadata/tmdb";
import { DesktopChromeBridge } from "@/components/DesktopChromeBridge";
import { DetailsModal } from "@/components/overlays/detailsModal";
import { MangaDetailsModal } from "@/components/overlays/mangaDetails/MangaDetailsModal";
import { DownloadModal } from "@/components/overlays/downloadModal";
import { OptimizeModal, OptimizeEffectsSync } from "@/components/overlays/optimizeModal";
import { DesktopAppSettingsModal } from "@/components/overlays/desktopAppSettings";
import { GamepadControlsModal } from "@/components/overlays/GamepadControlsModal";
import { KeyboardCommandsEditModal } from "@/components/overlays/KeyboardCommandsEditModal";
import { KeyboardCommandsModal } from "@/components/overlays/KeyboardCommandsModal";
import { NotificationModal } from "@/components/overlays/notificationsModal";
import { SupportInfoModal } from "@/components/overlays/SupportInfoModal";
import { TipJarModal } from "@/components/overlays/tipJarModal";
import { SimklAuthHandler } from "@/components/auth/SimklAuthHandler";
import { UpdateNotice } from "@/components/UpdateNotice";
import { TraktAuthHandler } from "@/components/auth/TraktAuthHandler";
import { useGlobalKeyboardEvents } from "@/hooks/useGlobalKeyboardEvents";
import { useClientPlatformAnalytics } from "@/hooks/useClientPlatformAnalytics";
import { useOnlineListener } from "@/hooks/usePing";
import { useScrollLockRestore } from "@/hooks/useScrollLockRestore";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import MaintenancePage from "@/pages/errors/MaintenancePage";
import { NotFoundPage } from "@/pages/errors/NotFoundPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/Login";
import { RegisterPage } from "@/pages/Register";
import { AllBookmarks } from "@/pages/bookmarks/AllBookmarks";
import { Layout } from "@/setup/Layout";
import { useHistoryListener } from "@/stores/history";
import { useClearModalsOnNavigation } from "@/stores/interface/overlayStack";
import { LanguageProvider } from "@/stores/language";
import { conf } from "@/setup/config";
import { purgeBannerAds } from "@/utils/ads/purgeBannerAds";
import { PlayerView, SettingsPage, MangaReaderView, preloadPlayerView, preloadSettingsPage } from "@/setup/routePreload";

const AboutPage = lazy(() =>
  import("@/pages/About").then((m) => ({ default: m.AboutPage })),
);
const AppsPage = lazy(() =>
  import("@/pages/Apps").then((m) => ({ default: m.AppsPage })),
);
const AdminPage = lazy(() =>
  import("@/pages/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const PersonView = lazy(() =>
  import("@/pages/PersonView").then((m) => ({ default: m.PersonView })),
);
const CelPage = lazy(() =>
  import("@/pages/Cel").then((m) => ({ default: m.CelPage })),
);
const MigrationPage = lazy(() =>
  import("@/pages/migration/Migration").then((m) => ({
    default: m.MigrationPage,
  })),
);
const MigrationDirectPage = lazy(() =>
  import("@/pages/migration/MigrationDirect").then((m) => ({
    default: m.MigrationDirectPage,
  })),
);
const MigrationDownloadPage = lazy(() =>
  import("@/pages/migration/MigrationDownload").then((m) => ({
    default: m.MigrationDownloadPage,
  })),
);
const MigrationPasskeyPage = lazy(() =>
  import("@/pages/migration/MigrationPasskey").then((m) => ({
    default: m.MigrationPasskeyPage,
  })),
);
const MigrationUploadPage = lazy(() =>
  import("@/pages/migration/MigrationUpload").then((m) => ({
    default: m.MigrationUploadPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("@/pages/onboarding/Onboarding").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const OnboardingExtensionPage = lazy(() =>
  import("@/pages/onboarding/OnboardingExtension").then((m) => ({
    default: m.OnboardingExtensionPage,
  })),
);
const OnboardingProxyPage = lazy(() =>
  import("@/pages/onboarding/OnboardingProxy").then((m) => ({
    default: m.OnboardingProxyPage,
  })),
);
const PasPage = lazy(() =>
  import("@/pages/Pas").then((m) => ({ default: m.PasPage })),
);
const SupportPage = lazy(() =>
  import("@/pages/Support").then((m) => ({ default: m.SupportPage })),
);
const MyAlgorithmPage = lazy(() =>
  import("@/pages/algorithm/MyAlgorithm").then((m) => ({
    default: m.MyAlgorithmPage,
  })),
);
const ReadHistory = lazy(() =>
  import("@/pages/readHistory/ReadHistory").then((m) => ({
    default: m.ReadHistory,
  })),
);
const WatchHistory = lazy(() =>
  import("@/pages/watchHistory/WatchHistory").then((m) => ({
    default: m.WatchHistory,
  })),
);
const LegalPage = lazy(() =>
  import("@/pages/Legal").then((m) => ({ default: m.LegalPage })),
);

/** Re-export intent preloads for callers that already import from App. */
export { preloadPlayerView, preloadSettingsPage } from "@/setup/routePreload";

function LegacyUrlView({ children }: { children: ReactElement }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const url = location.pathname;
    if (!isLegacyUrl(url)) return;
    convertLegacyUrl(location.pathname).then((convertedUrl) => {
      navigate(convertedUrl ?? "/", { replace: true });
    });
  }, [location.pathname, navigate]);

  if (isLegacyUrl(location.pathname)) return null;
  return children;
}

function QuickSearch() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      generateQuickSearchMediaUrl(query).then((url) => {
        navigate(url ?? "/", { replace: true });
      });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

function QueryView() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      navigate(`/browse/${encodeURIComponent(query)}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

export const maintenanceTime = "March 31th 11:00 PM - 5:00 AM EST";

function App() {
  useHistoryListener();
  useOnlineListener();
  useGlobalKeyboardEvents();
  useClientPlatformAnalytics();
  useClearModalsOnNavigation();
  const location = useLocation();
  const maintenance = false; // Shows maintance page
  const [showDowntime, setShowDowntime] = useState(maintenance);

  // Footer/nav Link navigations keep the previous scroll offset otherwise.
  useScrollRestoration();
  useScrollLockRestore();

  useEffect(() => {
    if (location.pathname.startsWith("/media/")) preloadPlayerView();
    if (location.pathname.startsWith("/settings")) preloadSettingsPage();
  }, [location.pathname]);

  useEffect(() => {
    window.__kstreamLoadPopunder?.();
    if (
      location.pathname.startsWith("/media/") ||
      location.pathname.startsWith("/manga/")
    ) {
      purgeBannerAds();
      window.__kstreamUnloadPopunder?.();
    }
  }, [location.pathname]);

  useEffect(() => {
    const cfg = conf();
    if (!cfg.ENABLE_RYBBIT || !cfg.RYBBIT_SCRIPT_URL || !cfg.RYBBIT_SITE_ID)
      return;
    if (typeof document === "undefined") return;
    if (document.querySelector("script[data-rybbit]")) return;
    const s = document.createElement("script");
    s.src = cfg.RYBBIT_SCRIPT_URL;
    s.defer = true;
    s.dataset.siteId = cfg.RYBBIT_SITE_ID;
    s.dataset.rybbit = "1";
    document.head.appendChild(s);
  }, []);

  const handleButtonClick = () => {
    setShowDowntime(false);
  };

  useEffect(() => {
    const sessionToken = sessionStorage.getItem("downtimeToken");
    if (!sessionToken && maintenance) {
      setShowDowntime(true);
      sessionStorage.setItem("downtimeToken", "true");
    }
  }, [setShowDowntime, maintenance]);

  return (
    <Layout>
      <TraktAuthHandler />
      <SimklAuthHandler />
      <LanguageProvider />
      <UpdateNotice />
      <DesktopChromeBridge />
      <NotificationModal id="notifications" />
      <TipJarModal id="tip-jar" />
      <DownloadModal id="download" />
      <OptimizeEffectsSync />
      <OptimizeModal />
      <DesktopAppSettingsModal id="desktop-app-settings" />
      <KeyboardCommandsModal id="keyboard-commands" />
      <KeyboardCommandsEditModal id="keyboard-commands-edit" />
      <GamepadControlsModal id="gamepad-controls-edit" />
      <SupportInfoModal id="support-info" />
      <DetailsModal id="details" />
      <DetailsModal id="discover-details" />
      <DetailsModal id="player-details" />
      <MangaDetailsModal id="manga-details" />
      {!showDowntime && (
        <Routes>
          {/* functional routes */}
          <Route path="/s/:query" element={<QuickSearch />} />
          <Route path="/search/:type" element={<Navigate to="/browse" />} />
          <Route path="/search/:type/:query?" element={<QueryView />} />
          {/* pages */}
          <Route
            path="/media/:media"
            element={
              <LegacyUrlView>
                <Suspense fallback={null}>
                  <PlayerView />
                </Suspense>
              </LegacyUrlView>
            }
          />
          <Route
            path="/media/:media/:season/:episode"
            element={
              <LegacyUrlView>
                <Suspense fallback={null}>
                  <PlayerView />
                </Suspense>
              </LegacyUrlView>
            }
          />
          <Route
            path="/manga/:media"
            element={
              <Suspense fallback={null}>
                <MangaReaderView />
              </Suspense>
            }
          />
          <Route
            path="/manga/:media/:chapter"
            element={
              <Suspense fallback={null}>
                <MangaReaderView />
              </Suspense>
            }
          />
          <Route path="/browse/:query?" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/about"
            element={
              <Suspense fallback={null}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="/apps"
            element={
              <Suspense fallback={null}>
                <AppsPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding"
            element={
              <Suspense fallback={null}>
                <OnboardingPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding/extension"
            element={
              <Suspense fallback={null}>
                <OnboardingExtensionPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding/proxy"
            element={
              <Suspense fallback={null}>
                <OnboardingProxyPage />
              </Suspense>
            }
          />

          {/* Migration pages - awaiting import and export fixes */}
          <Route
            path="/migration"
            element={
              <Suspense fallback={null}>
                <MigrationPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/direct"
            element={
              <Suspense fallback={null}>
                <MigrationDirectPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/download"
            element={
              <Suspense fallback={null}>
                <MigrationDownloadPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/upload"
            element={
              <Suspense fallback={null}>
                <MigrationUploadPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/passkey"
            element={
              <Suspense fallback={null}>
                <MigrationPasskeyPage />
              </Suspense>
            }
          />

          {conf().DMCA_EMAIL ? (
            <Route
              path="/legal"
              element={
                <Suspense fallback={null}>
                  <LegalPage />
                </Suspense>
              }
            />
          ) : null}
          {/* Support page */}
          <Route
            path="/support"
            element={
              <Suspense fallback={null}>
                <SupportPage />
              </Suspense>
            }
          />
          <Route
            path="/cel"
            element={
              <Suspense fallback={null}>
                <CelPage />
              </Suspense>
            }
          />
          <Route
            path="/pas"
            element={
              <Suspense fallback={null}>
                <PasPage />
              </Suspense>
            }
          />
          {/* Legacy discover URLs → home */}
          <Route path="/discover/*" element={<Navigate to="/" replace />} />
          <Route path="/discover" element={<Navigate to="/" replace />} />
          {/* Bookmarks page */}
          <Route path="/bookmarks" element={<AllBookmarks />} />
          <Route
            path="/person/:id"
            element={
              <Suspense fallback={null}>
                <PersonView />
              </Suspense>
            }
          />
          {/* Watch History page */}
          <Route
            path="/watch-history"
            element={
              <Suspense fallback={null}>
                <WatchHistory />
              </Suspense>
            }
          />
          <Route
            path="/read-history"
            element={
              <Suspense fallback={null}>
                <ReadHistory />
              </Suspense>
            }
          />
          <Route
            path="/algorithm"
            element={
              <Suspense fallback={null}>
                <MyAlgorithmPage />
              </Suspense>
            }
          />
          {/* Settings page */}
          <Route
            path="/settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            }
          />
          {/* admin routes */}
          <Route
            path="/admin"
            element={
              <Suspense fallback={null}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
      {showDowntime && (
        <MaintenancePage onHomeButtonClick={handleButtonClick} />
      )}
    </Layout>
  );
}

export default App;
