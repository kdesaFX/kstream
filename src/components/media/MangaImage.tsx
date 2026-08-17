import type { ImgHTMLAttributes, SyntheticEvent } from "react";

import { proxiedMangaCoverUrl } from "@/backend/manga/mangadex";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

type MangaImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "referrerPolicy" | "src"
> & {
  src: string;
};

/**
 * MangaDex cover hotlinking behaves differently across browsers and networks.
 * Try the CDN directly first, then retry through the configured proxy before
 * conceding to the local placeholder.
 */
export function MangaImage({ src, onError, ...props }: MangaImageProps) {
  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    if (event.defaultPrevented) return;

    const image = event.currentTarget;
    if (image.dataset.mangaFallback !== "proxy") {
      const proxyUrl = proxiedMangaCoverUrl(src, getProxyUrls());
      if (proxyUrl && image.src !== proxyUrl) {
        image.dataset.mangaFallback = "proxy";
        image.src = proxyUrl;
        return;
      }
    }

    if (image.dataset.mangaFallback !== "placeholder") {
      image.dataset.mangaFallback = "placeholder";
      image.src = "/placeholder.png";
    }
  };

  return (
    <img
      {...props}
      src={src}
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
}
