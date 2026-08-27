/** Same-origin path; Worker streams the installer from R2. */
export const WINDOWS_APP_DOWNLOAD_PATH = "/download/kstream-Setup.exe";

export const WINDOWS_APP_DOWNLOAD_FILENAME = "kstream-Setup.exe";

/** Approximate packed size shown in the download UI (~82 MB as of v1.2.29). */
export const WINDOWS_APP_DOWNLOAD_SIZE_LABEL = "~82 MB";

/** Trigger a direct .exe download without opening a GitHub page. */
export function downloadWindowsApp() {
  const anchor = document.createElement("a");
  anchor.href = WINDOWS_APP_DOWNLOAD_PATH;
  anchor.download = WINDOWS_APP_DOWNLOAD_FILENAME;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
