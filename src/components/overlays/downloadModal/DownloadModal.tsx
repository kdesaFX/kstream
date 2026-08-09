import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";
import {
  WINDOWS_APP_DOWNLOAD_FILENAME,
  WINDOWS_APP_DOWNLOAD_PATH,
} from "@/utils/downloadWindowsApp";

export function DownloadModal({ id }: { id: string }) {
  return (
    <FancyModal id={id} title="Download kstream" size="md">
      <div className="space-y-4">
        <p className="text-type-secondary text-base leading-relaxed">
          Take kstream with you. Get the Windows app below.
        </p>

        <a
          href={WINDOWS_APP_DOWNLOAD_PATH}
          download={WINDOWS_APP_DOWNLOAD_FILENAME}
          className="group flex w-full rounded-2xl bg-modal-background/60 hover:bg-modal-background/80 transition-colors border border-utils-divider/40 hover:border-white/10 p-4 text-left no-underline"
        >
          <div className="flex w-full items-center gap-4">
            <span className="flex shrink-0 items-center justify-center h-11 w-11 rounded-xl text-xl bg-buttons-purple/20 text-buttons-purple border border-buttons-purple/30">
              <Icon icon={Icons.DOWNLOAD} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-white font-medium">Windows App</div>
              <div className="text-xs text-type-secondary mt-0.5">
                Native desktop app, with built-in auto-updates.
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border bg-white/5 text-white/80 border-white/10 transition-all group-hover:bg-white/10 group-hover:text-white">
              Download
              <Icon
                icon={Icons.CHEVRON_RIGHT}
                className="text-sm transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </a>
      </div>
    </FancyModal>
  );
}
