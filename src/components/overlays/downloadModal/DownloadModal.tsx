import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import {
  WINDOWS_APP_DOWNLOAD_FILENAME,
  WINDOWS_APP_DOWNLOAD_PATH,
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

export function DownloadModal({ id }: { id: string }) {
  const intent = useOverlayStack((s) => s.getModalData(id)?.intent);
  const fromAds = intent === "ads";

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
            Get the Windows app — no Adsterra, no popunders. Same kstream, built
            for the desktop.
          </p>
        ) : (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
            <p className="text-sm leading-relaxed text-emerald-100/90">
              <span className="font-semibold text-emerald-200">
                You’re safe.
              </span>{" "}
              This is the official Windows app. Windows may show a SmartScreen
              warning because the installer isn’t code-signed yet, so follow the
              steps below and you’re good.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => downloadWindowsApp()}
          className="group flex w-full rounded-2xl border border-buttons-purple/40 bg-buttons-purple/15 p-4 text-left transition-colors hover:border-buttons-purple/60 hover:bg-buttons-purple/25"
        >
          <div className="flex w-full items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-buttons-purple/30 bg-buttons-purple/20 text-xl text-buttons-purple">
              <Icon icon={Icons.DOWNLOAD} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-white">Download Windows app</div>
              <div className="mt-0.5 text-xs text-type-secondary">
                {fromAds
                  ? "Ad-free · native app · starts right away"
                  : `${WINDOWS_APP_DOWNLOAD_FILENAME} · starts right away`}
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

        {!fromAds ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-sm leading-relaxed text-type-secondary">
              Bonus: the Windows app runs{" "}
              <span className="font-semibold text-white">without ads</span>.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
            <p className="text-sm leading-relaxed text-emerald-100/90">
              <span className="font-semibold text-emerald-200">
                You’re safe.
              </span>{" "}
              Official installer from our site. Windows SmartScreen may warn
              because it isn’t code-signed yet — use More info → Run anyway.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-type-secondary">
            Install guide
          </h3>

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

        <p className="text-center text-xs text-type-secondary">
          Prefer a direct link?{" "}
          <a
            href={WINDOWS_APP_DOWNLOAD_PATH}
            download={WINDOWS_APP_DOWNLOAD_FILENAME}
            className="text-buttons-purple underline-offset-2 hover:underline"
          >
            {WINDOWS_APP_DOWNLOAD_FILENAME}
          </a>
        </p>
      </div>
    </FancyModal>
  );
}
