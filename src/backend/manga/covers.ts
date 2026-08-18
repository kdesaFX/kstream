export function mangaDexCoverUrl(
  mangaId: string,
  fileName: string,
  size: 256 | 512 = 256,
): string {
  const params = new URLSearchParams({
    source: "mangadex",
    id: mangaId,
    file: fileName,
    size: String(size),
  });
  return `/api/manga-cover?${params.toString()}`;
}

export function weebCentralCoverUrl(seriesId: string): string {
  const params = new URLSearchParams({
    source: "weebcentral",
    id: seriesId,
  });
  return `/api/manga-cover?${params.toString()}`;
}

export function weebCentralPageUrl(pageUrl: string): string {
  const params = new URLSearchParams({
    source: "weebcentral-page",
    url: pageUrl,
  });
  return `/api/manga-cover?${params.toString()}`;
}

/** Upgrade cover URLs saved before the same-origin cover proxy was introduced. */
export function proxiedMangaCoverUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "uploads.mangadex.org") {
      const match =
        /^\/covers\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+)\.(256|512)\.jpg$/.exec(
          parsed.pathname,
        );
      if (match) {
        return mangaDexCoverUrl(
          match[1],
          match[2],
          Number(match[3]) as 256 | 512,
        );
      }
    }

    if (parsed.hostname === "temp.compsci88.com") {
      const match =
        /^\/cover\/normal\/([a-zA-Z0-9-]+)\.webp$/.exec(parsed.pathname);
      if (match) return weebCentralCoverUrl(match[1]);
    }
  } catch {
    return url;
  }

  return url;
}
