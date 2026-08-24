import { proxiedMangaUrl } from "@/backend/manga/mangadex";
import { usePreferencesStore } from "@/stores/preferences";
import type { PosterQuality } from "@/stores/preferences/deviceProfile";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

export function tmdbPosterSize(quality: PosterQuality): "w185" | "w342" {
  return quality === "low" ? "w185" : "w342";
}

export function rewriteTmdbPosterUrl(
  url: string,
  quality: PosterQuality,
): string {
  if (quality !== "low") return url;
  return url
    .replace(/\/t\/p\/w342\/?/g, "/t/p/w185/")
    .replace(/\/t\/p\/w500\/?/g, "/t/p/w185/")
    .replace(/\/t\/p\/original\/?/g, "/t/p/w185/");
}

function isArtworkUrl(url: string): boolean {
  return (
    url.includes("image.tmdb.org") ||
    url.includes("uploads.mangadex.org") ||
    url.includes("mangadex.org/covers") ||
    url.includes("weebcentral.com")
  );
}

export function isMangaDexCoverUrl(url: string): boolean {
  return (
    url.includes("uploads.mangadex.org") ||
    url.includes("mangadex.org/covers")
  );
}

export function maybeProxyArtworkUrl(
  url: string,
  opts?: { proxyTmdb?: boolean; proxyArtwork?: boolean },
): string {
  if (url.includes("destination=")) return url;
  const proxyTmdb =
    opts?.proxyTmdb ?? usePreferencesStore.getState().proxyTmdb;
  const proxyArtwork =
    opts?.proxyArtwork ?? usePreferencesStore.getState().proxyArtwork;
  const isTmdb = url.includes("image.tmdb.org");
  const isManga = !isTmdb && isArtworkUrl(url);
  if (isTmdb && !proxyTmdb && !proxyArtwork) return url;
  if (isManga && !proxyArtwork) return url;
  if (!isTmdb && !isManga) return url;
  const proxied = proxiedMangaUrl(url, getProxyUrls());
  return proxied ?? url;
}

export function resolveCardArtworkUrl(
  url: string | undefined | null,
): string | undefined {
  if (!url) return undefined;
  const { posterQuality, proxyTmdb, proxyArtwork } =
    usePreferencesStore.getState();
  const sized = rewriteTmdbPosterUrl(url, posterQuality);

  // MangaDex serves a "read this at mangadex.org" card when the referrer is
  // wrong. CSS backgrounds can't control Referer; mobile Safari is flaky with
  // no-referrer alone — always fetch covers through our proxy (Referer stamp).
  if (isMangaDexCoverUrl(sized)) {
    const proxied = proxiedMangaUrl(sized, getProxyUrls());
    return proxied ?? sized;
  }

  return maybeProxyArtworkUrl(sized, {
    proxyTmdb,
    proxyArtwork,
  });
}
