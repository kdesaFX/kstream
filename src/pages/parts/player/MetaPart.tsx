import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "react-use";
import type { AsyncReturnType } from "type-fest";

import { isAllowedExtensionVersion } from "@/backend/extension/compatibility";
import { extensionInfo, sendPage } from "@/backend/extension/messaging";
import { setCachedMetadata } from "@/backend/helpers/providerApi";
import { DetailedMeta, getMetaFromId } from "@/backend/metadata/getmeta";
import { decodeTMDBId } from "@/backend/metadata/tmdb";
import { MWMediaType } from "@/backend/metadata/types/mw";
import { getProviders } from "@/backend/providers/providers";
import { Button } from "@/components/buttons/Button";
import { Icons } from "@/components/Icon";
import { UnifiedScrapingLoader } from "@/components/player/internals/UnifiedScrapingLoader";
import { PlayerStageMessage } from "@/components/player/internals/PlayerStageOverlay";
import { conf } from "@/setup/config";

export interface MetaPartProps {
  onGetMeta?: (meta: DetailedMeta, episodeId?: string) => void;
}

function isDisallowedMedia(id: string, type: MWMediaType): boolean {
  const disallowedEntries = conf().DISALLOWED_IDS.map((v) => v.split("-"));
  if (disallowedEntries.find((entry) => id === entry[1] && type === entry[0]))
    return true;
  return false;
}

export function MetaPart(props: MetaPartProps) {
  const { t } = useTranslation();
  const params = useParams<{
    media: string;
    episode?: string;
    season?: string;
  }>();
  const navigate = useNavigate();

  const { error, value, loading } = useAsync(async () => {
    const info = await extensionInfo();
    const isValidExtension =
      info?.success && isAllowedExtensionVersion(info.version) && info.allowed;

    if (isValidExtension) {
      if (!info.hasPermission) throw new Error("extension-no-permission");
    }

    try {
      setCachedMetadata([
        ...getProviders().listSources(),
        ...getProviders().listEmbeds(),
      ]);
    } catch (err) {
      console.error("Failed to initialize providers for player:", err);
    }

    let data: ReturnType<typeof decodeTMDBId> = null;
    try {
      if (!params.media) throw new Error("no media params");
      data = decodeTMDBId(params.media);
    } catch {
      // error dont matter, itll just be a 404
    }
    if (!data) return null;

    if (isDisallowedMedia(data.id, data.type)) throw new Error("legal");

    let meta: AsyncReturnType<typeof getMetaFromId> = null;
    try {
      meta = await getMetaFromId(data.type, data.id, params.season);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        return null;
      }
      throw err;
    }
    if (!meta) return null;

    let epId = params.episode;
    if (meta.meta.type === MWMediaType.SERIES) {
      const episodes = meta.meta.seasonData?.episodes ?? [];
      let ep = episodes.find((v) => v.id === params.episode);
      if (!ep) ep = episodes[0];
      if (!ep) return null;
      epId = ep.id;
      if (
        params.season !== meta.meta.seasonData.id ||
        params.episode !== ep.id
      ) {
        navigate(`/media/${params.media}/${meta.meta.seasonData.id}/${ep.id}`, {
          replace: true,
        });
      }
    }

    props.onGetMeta?.(meta, epId);
    return meta;
  }, [params.media, params.season, params.episode, navigate]);

  if (error && error.message === "extension-no-permission") {
    return (
      <PlayerStageMessage
        badge={t("player.metadata.extensionPermission.badge")}
        badgeIcon={Icons.WAND}
        heading={t("player.metadata.extensionPermission.title")}
        body={t("player.metadata.extensionPermission.text")}
      >
        <Button
          onClick={() => {
            sendPage({
              page: "PermissionGrant",
              redirectUrl: window.location.href,
            });
          }}
          theme="purple"
          padding="md:px-12 p-2.5"
          className="w-full max-w-xs"
        >
          {t("player.metadata.extensionPermission.button")}
        </Button>
      </PlayerStageMessage>
    );
  }

  if (error && error.message === "legal") {
    return (
      <PlayerStageMessage
        badge={t("player.metadata.legal.badge")}
        badgeIcon={Icons.DRAGON}
        heading={t("player.metadata.legal.title")}
        body={t("player.metadata.legal.text")}
      >
        <Button href="/" theme="purple" padding="md:px-12 p-2.5" className="w-full max-w-xs">
          {t("player.metadata.failed.homeButton")}
        </Button>
      </PlayerStageMessage>
    );
  }

  if (error) {
    return (
      <PlayerStageMessage
        badge={t("player.metadata.failed.badge")}
        heading={t("player.metadata.failed.title")}
        body={t("player.metadata.failed.text")}
      >
        <Button href="/" theme="purple" padding="md:px-12 p-2.5" className="w-full max-w-xs">
          {t("player.metadata.failed.homeButton")}
        </Button>
      </PlayerStageMessage>
    );
  }

  if (!value && !loading) {
    return (
      <PlayerStageMessage
        badge={t("player.metadata.notFound.badge")}
        heading={t("player.metadata.notFound.title")}
        body={t("player.metadata.notFound.text")}
      >
        <Button href="/" theme="purple" padding="md:px-12 p-2.5" className="w-full max-w-xs">
          {t("player.metadata.notFound.homeButton")}
        </Button>
      </PlayerStageMessage>
    );
  }

  return (
    <div className="relative h-full w-full">
      <UnifiedScrapingLoader statusKey="player.scraping.unified.starting" />
    </div>
  );
}
