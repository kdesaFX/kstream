/** Same-origin path; Vercel redirects to the GitHub release asset. */
export const WINDOWS_APP_DOWNLOAD_PATH = "/download/kstream-Setup.exe";

export const WINDOWS_APP_DOWNLOAD_FILENAME = "kstream-Setup.exe";

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
