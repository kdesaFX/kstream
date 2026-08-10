import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { iso6393To1 } from "iso-639-3";

import { getArtemisVariantMeta, getVariantMeta } from "@/sdk";
import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { Toggle } from "@/components/buttons/Toggle";
import { FlagIcon } from "@/components/FlagIcon";
import { Icon, Icons } from "@/components/Icon";
import { Spinner } from "@/components/layout/Spinner";
import { useCaptions } from "@/components/player/hooks/useCaptions";
import { useCasting } from "@/components/player/casting/useCasting";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { qualityToString } from "@/stores/player/utils/qualities";
import { useSubtitleStore } from "@/stores/subtitles";
import { isAnimeTitle } from "@/utils/media/anime";
import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";

function audioFlagCode(language?: string): string | undefined {
  if (!language) return undefined;
  if (language === "und") return undefined;
  return language.length === 3
    ? (iso6393To1[language] ?? language)
    : language;
}

/** Prefer TMDB original language when a source mislabels anime as English. */
function correctedSourceAudioLanguage(
  claimed: string | undefined,
  meta: {
    genreIds?: number[];
    originalLanguage?: string;
    originCountry?: string[];
  } | null,
): string | undefined {
  const lang = claimed?.trim().toLowerCase();
  if (!lang || lang === "und") return lang || undefined;
  const original = meta?.originalLanguage?.trim().toLowerCase().slice(0, 2);
  if (
    lang === "en" &&
    original &&
    original !== "en" &&
    isAnimeTitle(meta)
  ) {
    return original;
  }
  return lang;
}

export function SettingsMenu({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useOverlayRouter(id);
  const currentQuality = usePlayerStore((s) => s.currentQuality);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const audioTracks = usePlayerStore((s) => s.audioTracks);
  const audioStreamOptions = usePlayerStore((s) => s.audioStreamOptions);
  const currentAudioStreamId = usePlayerStore((s) => s.currentAudioStreamId);
  const status = usePlayerStore((s) => s.status);
  const source = usePlayerStore((s) => s.source);
  const meta = usePlayerStore((s) => s.meta);
  const selectedCaptionLanguage = usePlayerStore(
    (s) => s.caption.selected?.language,
  );
  const subtitlesEnabled = useSubtitleStore((s) => s.enabled);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const currentEmbedId = usePlayerStore(
    (s) => (s as any).embedId as string | null,
  );
  // While scrapers are still searching (or nothing is loaded yet), Quality /
  // Audio aren't meaningful — show a spinner and block navigation.
  const awaitingSource =
    status === playerStatus.SCRAPING ||
    (status !== playerStatus.PLAYING && !source);
  const sourceName = useMemo(() => {
    if (!currentSourceId) return "...";
    // Compact label for the cramped settings grid only — lists/scrape keep full names.
    if (currentSourceId === "tqq") return "TQQ";
    const sourceMeta = getCachedMetadata().find(
      (src) => src.id === currentSourceId,
    );
    return sourceMeta?.name ?? "...";
  }, [currentSourceId]);
  const embedName = useMemo(() => {
    if (!currentEmbedId) return undefined;
    const embedMeta = getCachedMetadata().find((s) => s.id === currentEmbedId);
    return embedMeta?.name;
  }, [currentEmbedId]);
  const { toggleLastUsed } = useCaptions();

  const selectedLanguagePretty = selectedCaptionLanguage
    ? (getPrettyLanguageNameFromLocale(selectedCaptionLanguage) ??
      t("player.menus.subtitles.unknownLanguage"))
    : undefined;

  const selectedAudioLanguagePretty = (() => {
    const streamOpt = audioStreamOptions.find(
      (o) => o.id === currentAudioStreamId,
    );
    if (streamOpt) {
      return (
        streamOpt.label ||
        getPrettyLanguageNameFromLocale(streamOpt.language) ||
        t("player.menus.subtitles.unknownLanguage")
      );
    }
    if (currentAudioTrack) {
      return (
        getPrettyLanguageNameFromLocale(currentAudioTrack.language) ??
        currentAudioTrack.label ??
        t("player.menus.subtitles.unknownLanguage")
      );
    }
    const lang = correctedSourceAudioLanguage(source?.audioLanguage, meta);
    if (source?.audioLabel?.trim() && lang === source.audioLanguage?.trim()) {
      if (lang === "es") return "Spanish";
      if (lang === "en") return "English";
      if (lang === "ja") return "Japanese";
      if (lang === "und") return "Original";
      return (
        source.audioLabel.trim().replace(/\s*\([^)]*\)\s*/g, "").trim() ||
        source.audioLabel.trim()
      );
    }
    if (lang) {
      return (
        getPrettyLanguageNameFromLocale(lang) ??
        (lang === "es"
          ? "Spanish"
          : lang === "en"
            ? "English"
            : lang === "ja"
              ? "Japanese"
              : lang === "und"
                ? "Original"
                : lang.toUpperCase())
      );
    }
    return undefined;
  })();

  const selectedAudioLangCode = (() => {
    const streamOpt = audioStreamOptions.find(
      (o) => o.id === currentAudioStreamId,
    );
    if (streamOpt?.language) return audioFlagCode(streamOpt.language);
    if (currentAudioTrack?.language)
      return audioFlagCode(currentAudioTrack.language);
    return audioFlagCode(
      correctedSourceAudioLanguage(source?.audioLanguage, meta),
    );
  })();

  const audioLanguageLabel = (
    <span className="text-type-secondary text-sm leading-5 h-5 flex items-center justify-center gap-1.5">
      {selectedAudioLangCode ? (
        <span className="inline-flex scale-75 origin-center">
          <FlagIcon langCode={selectedAudioLangCode} />
        </span>
      ) : null}
      <span>
        {selectedAudioLanguagePretty ?? t("player.menus.audio.default")}
      </span>
    </span>
  );

  const hasAudioChoices =
    audioStreamOptions.length > 1 || audioTracks.length > 1;

  const downloadable = source?.type === "file" || source?.type === "hls";

  const {
    isCasting,
    chromecastAvailable,
    airplayAvailable,
    startChromecast,
    startAirplay,
    stop,
  } = useCasting();
  const castPlatformAvailable = chromecastAvailable || airplayAvailable;

  const requestCast = () => {
    if (isCasting) {
      stop();
      return;
    }
    if (chromecastAvailable) {
      startChromecast();
      return;
    }
    startAirplay();
  };

  const variantMeta =
    currentSourceId === "aurora"
      ? getVariantMeta()
      : currentSourceId === "artemis"
        ? getArtemisVariantMeta()
        : null;
  const hasVariants = (variantMeta?.variants?.length ?? 0) > 1;

  return (
    <Menu.Card>
      <Menu.Section grid>
        <Menu.ChevronLink
          box
          disabled={awaitingSource}
          onClick={() => {
            if (awaitingSource) return;
            router.navigate("/quality");
          }}
          rightText={
            awaitingSource
              ? undefined
              : currentQuality
                ? qualityToString(currentQuality)
                : ""
          }
        >
          {t("player.menus.settings.qualityItem")}
          <span className="text-type-secondary text-sm leading-5 h-5 flex items-center justify-center">
            {awaitingSource ? (
              <Spinner className="text-sm" />
            ) : currentQuality ? (
              qualityToString(currentQuality)
            ) : (
              t("player.menus.quality.auto")
            )}
          </span>
        </Menu.ChevronLink>
        <Menu.ChevronLink
          box
          onClick={() => router.navigate("/source")}
          rightText={sourceName}
        >
          {t("player.menus.settings.sourceItem")}
          <span className="text-type-secondary text-sm leading-5 text-center px-1">
            {sourceName}
          </span>
          {embedName && (
            <span className="text-type-secondary text-xs text-center px-1">
              {embedName}
            </span>
          )}
        </Menu.ChevronLink>
        <Menu.ChevronLink
          box
          disabled={awaitingSource}
          onClick={() => {
            if (awaitingSource) return;
            router.navigate("/captions");
          }}
          rightText={awaitingSource ? undefined : sourceName}
        >
          {t("player.menus.settings.subtitleItem")}
          <span className="text-type-secondary text-sm leading-5 h-5 flex items-center justify-center">
            {awaitingSource ? (
              <Spinner className="text-sm" />
            ) : (
              (selectedLanguagePretty ?? t("player.menus.subtitles.offChoice"))
            )}
          </span>
        </Menu.ChevronLink>
        {awaitingSource ? (
          <Menu.ChevronLink box disabled onClick={() => {}}>
            {t("player.menus.settings.audioItem")}
            <span className="text-type-secondary text-sm leading-5 h-5 flex items-center justify-center">
              <Spinner className="text-sm" />
            </span>
          </Menu.ChevronLink>
        ) : hasAudioChoices ? (
          <Menu.ChevronLink
            box
            onClick={() => router.navigate("/audio")}
            rightText={selectedAudioLanguagePretty ?? undefined}
          >
            {t("player.menus.settings.audioItem")}
            {audioLanguageLabel}
          </Menu.ChevronLink>
        ) : (
          <Menu.ChevronLink
            box
            onClick={() => router.navigate("/audio")}
            disabled
          >
            {t("player.menus.settings.audioItem")}
            {audioLanguageLabel}
          </Menu.ChevronLink>
        )}
      </Menu.Section>
      <Menu.Section>
        <Menu.Link
          clickable
          onClick={() =>
            router.navigate(downloadable ? "/download" : "/download/unable")
          }
          rightSide={<Icon className="text-xl" icon={Icons.DOWNLOAD} />}
          className={downloadable ? "opacity-100" : "opacity-50"}
        >
          {t("player.menus.settings.downloadItem")}
        </Menu.Link>
        <Menu.Link
          clickable
          onClick={() =>
            router.navigate(downloadable ? "/watchparty" : "/download/unable")
          }
          rightSide={<Icon className="text-xl" icon={Icons.WATCH_PARTY} />}
          className={downloadable ? "opacity-100" : "opacity-50"}
        >
          {t("player.menus.watchparty.watchpartyItem")}
        </Menu.Link>
        {castPlatformAvailable ? (
          <Menu.Link
            clickable
            onClick={requestCast}
            rightSide={<Icon className="text-xl" icon={Icons.CASTING} />}
          >
            {t("player.menus.settings.castItem")}
          </Menu.Link>
        ) : null}
      </Menu.Section>
      {hasVariants ? (
        <Menu.Section>
          <Menu.ChevronLink
            onClick={() => router.navigate("/variant")}
            rightText={`${variantMeta!.variants!.length}`}
          >
            Stream Variants
          </Menu.ChevronLink>
        </Menu.Section>
      ) : null}
      <Menu.Section>
        <Menu.Link
          rightSide={
            <Toggle
              enabled={subtitlesEnabled}
              onClick={() => toggleLastUsed().catch(() => {})}
            />
          }
        >
          {t("player.menus.settings.enableSubtitles")}
        </Menu.Link>
        <Menu.ChevronLink onClick={() => router.navigate("/playback")}>
          {t("player.menus.settings.playbackItem")}
        </Menu.ChevronLink>
        <Menu.ChevronLink
          onClick={() => router.navigate("/playback/skip-segments")}
        >
          {t("player.skipTime.skipSegments")}
        </Menu.ChevronLink>
      </Menu.Section>
    </Menu.Card>
  );
}
