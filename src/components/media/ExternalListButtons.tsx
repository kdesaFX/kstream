import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  anilistPageUrl,
  lookupAniListExternal,
  malPageUrl,
  type AniListExternalIds,
  type AniListMediaType,
} from "@/backend/metadata/anilistExternal";
import { Icon, Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ExternalListButtons({
  titles,
  type,
  variant = "player",
}: {
  titles: Array<string | undefined | null>;
  type: AniListMediaType;
  variant?: "player" | "reader";
}) {
  const { t } = useTranslation();
  const [ids, setIds] = useState<AniListExternalIds | null>(null);

  useEffect(() => {
    let cancelled = false;
    lookupAniListExternal(titles, type)
      .then((result) => {
        if (!cancelled) setIds(result);
      })
      .catch(() => {
        if (!cancelled) setIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [titles.join("|"), type]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ids) return null;

  const anilistHref = anilistPageUrl(type, ids.anilistId);
  const malHref = ids.malId ? malPageUrl(type, ids.malId) : null;

  if (variant === "reader") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={t("media.external.anilist")}
          aria-label={t("media.external.anilist")}
          onClick={() => openExternal(anilistHref)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
        >
          <Icon icon={Icons.ANILIST} className="text-lg" />
        </button>
        {malHref ? (
          <button
            type="button"
            title={t("media.external.mal")}
            aria-label={t("media.external.mal")}
            onClick={() => openExternal(malHref)}
            className="flex h-8 items-center justify-center rounded-lg bg-white/10 px-2 text-white hover:bg-white/20"
          >
            <Icon icon={Icons.MAL} className="text-base" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <VideoPlayerButton
        onClick={() => openExternal(anilistHref)}
        icon={Icons.ANILIST}
        iconSizeClass="text-xl"
        className="text-white"
        title={t("media.external.anilist")}
      />
      {malHref ? (
        <VideoPlayerButton
          onClick={() => openExternal(malHref)}
          icon={Icons.MAL}
          iconSizeClass="text-lg"
          className="text-white"
          title={t("media.external.mal")}
        />
      ) : null}
    </>
  );
}
