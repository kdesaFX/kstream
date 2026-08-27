import { useEffect, useState } from "react";

import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import {
  WINDOWS_APP_DOWNLOAD_FILENAME,
  WINDOWS_APP_DOWNLOAD_PATH,
  WINDOWS_APP_DOWNLOAD_SIZE_LABEL,
  downloadWindowsApp,
} from "@/utils/downloadWindowsApp";

const STEPS = [
  {
    title: "If Windows shows a purple warning",
    body: "That’s normal for a new app. It’s not a virus alert, just SmartScreen saying it hasn’t seen kstream much yet.",
    image: "/install-guide/01-more-info.jpg",
    imageAlt: "Windows SmartScreen warning with More info highlighted",
    tip: "Click More info",
  },
  {
    title: "Run anyway",
    body: "After More info, hit Run anyway. You’re installing the official kstream Windows app from our site.",
    image: "/install-guide/02-run-anyway.jpg",
    imageAlt: "SmartScreen expanded view with Run anyway highlighted",
    tip: "Click Run anyway",
  },
  {
    title: "Install (recommended)",
    body: "Pick Install to put kstream in AppData with Desktop + Start Menu shortcuts. Or keep it portable if you prefer.",
    image: "/install-guide/03-welcome.jpg",
    imageAlt: "kstream welcome screen with install and portable options",
    tip: "Choose Install",
  },
] as const;

function SafetyBanner() {
  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
      <p className="flex items-start gap-2.5 text-sm leading-relaxed text-emerald-100/90">
        <Icon
          icon={Icons.SHIELD}
          className="mt-0.5 shrink-0 text-base text-emerald-300"
        />
        <span>
          <span className="font-semibold text-emerald-200">You&apos;re safe.</span>{" "}
          Official installer from our site. Windows SmartScreen may warn because
          it isn&apos;t code-signed yet — use More info → Run anyway if needed.
        </span>
      </p>
    </div>
  );
}

function InstallGuideSteps() {
  return (
    <div className="space-y-4">
      {STEPS.map((step, i) => (
        <div
          key={step.title}
          className="overflow-hidden rounded-2xl border border-utils-divider/40 bg-modal-background/40"
        >
          <div className="border-b border-utils-divider/30 px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-buttons-purple/25 text-xs font-bold text-buttons-purple">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-white">{step.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-type-secondary">
                  {step.body}
                </p>
                <p className="mt-2 text-xs font-semibold text-buttons-purple">
                  → {step.tip}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-black/30 p-2 sm:p-3">
            <img
              src={step.image}
              alt={step.imageAlt}
              className="mx-auto w-full max-w-xl rounded-xl border border-white/5 object-contain"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DownloadModal({ id }: { id: string }) {
  const intent = useOverlayStack((s) => s.getModalData(id)?.intent);
  const isOpen = useOverlayStack((s) => s.isModalVisible(id));
  const fromAds = intent === "ads";
  const [showGuide, setShowGuide] = useState(false);

  // Modal stays mounted in App — reset to the download card when closed.
  useEffect(() => {
    if (!isOpen) setShowGuide(false);
  }, [isOpen]);

  const handleDownload = () => {
    downloadWindowsApp();
    setShowGuide(true);
  };

  return (
    <FancyModal
      id={id}
      title={
        fromAds
          ? "Want an ad-free experience?"
          : "Download kstream for Windows"
      }
      size="xl"
    >
      <div className="space-y-5">
        {fromAds ? (
          <p className="text-base leading-relaxed text-type-secondary">
            Get the Windows app — no ads, and a snappier experience. Same
            kstream, built for the desktop.
          </p>
        ) : null}

        {!showGuide ? (
          <>
            <button
              type="button"
              onClick={handleDownload}
              className="group flex w-full rounded-2xl border border-buttons-purple/40 bg-buttons-purple/15 p-4 text-left transition-colors hover:border-buttons-purple/60 hover:bg-buttons-purple/25"
            >
              <div className="flex w-full items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-buttons-purple/30 bg-buttons-purple/20 text-xl text-buttons-purple">
                  <Icon icon={Icons.DOWNLOAD} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">
                    Download Windows app
                  </div>
                  <div className="mt-0.5 text-xs text-type-secondary">
                    {fromAds
                      ? `Ad-free · native app · ${WINDOWS_APP_DOWNLOAD_SIZE_LABEL}`
                      : `${WINDOWS_APP_DOWNLOAD_FILENAME} · ${WINDOWS_APP_DOWNLOAD_SIZE_LABEL}`}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition-all group-hover:bg-white/10 group-hover:text-white">
                  Download
                  <Icon
                    icon={Icons.CHEVRON_RIGHT}
                    className="text-sm transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </div>
            </button>

            <SafetyBanner />

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
              <p className="text-sm leading-relaxed text-amber-100/90">
                School or work filters (GoGuardian, etc.) often block{" "}
                <span className="font-semibold text-amber-50">kdesa.stream</span>
                . Download the app on home Wi‑Fi or a phone hotspot, then install
                there. Streaming on a filtered network may still be blocked.
              </p>
            </div>

            {!fromAds ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-sm leading-relaxed text-type-secondary">
                  Bonus: the Windows app runs{" "}
                  <span className="font-semibold text-white">without ads</span>.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-buttons-purple/40 bg-buttons-purple/15">
            <div className="border-b border-buttons-purple/25 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-buttons-purple/30 bg-buttons-purple/20 text-lg text-buttons-purple">
                  <Icon icon={Icons.SHIELD} />
                </span>
                <div>
                  <div className="font-medium text-white">Install guide</div>
                  <p className="mt-0.5 text-xs text-type-secondary">
                    Follow these steps if Windows asks before installing
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <p className="text-center text-sm text-type-secondary">
                If your download didn&apos;t start automatically,{" "}
                <a
                  href={WINDOWS_APP_DOWNLOAD_PATH}
                  download={WINDOWS_APP_DOWNLOAD_FILENAME}
                  className="font-medium text-buttons-purple underline-offset-2 hover:underline"
                >
                  click here
                </a>
                .
              </p>

              <InstallGuideSteps />
            </div>
          </div>
        )}
      </div>
    </FancyModal>
  );
}
