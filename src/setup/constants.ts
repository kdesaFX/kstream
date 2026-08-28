export const APP_VERSION = import.meta.env.PACKAGE_VERSION;
export const DISCORD_LINK = "";
export const GITHUB_LINK = "";
export const TWITTER_LINK = "";
/** Primary contact for support + legal (override with VITE_DMCA_EMAIL if needed). */
export const SUPPORT_EMAIL = "kdesabiz@gmail.com";
export const GA_ID = import.meta.env.VITE_GA_ID;
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

/**
 * Same Worker as kdesa.stream — use when school/work filters block the main domain.
 * Proxies stay same-origin on this host (`/api/proxy`, `/api/m3u8-proxy`).
 */
export const SCHOOL_MIRROR_URL = "https://kstream.kdesabiz.workers.dev";
export const SCHOOL_MIRROR_LABEL = "School / filtered Wi‑Fi";
