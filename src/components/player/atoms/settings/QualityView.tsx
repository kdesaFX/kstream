import Hls from "hls.js";
import { t } from "i18next";
import { iso6393To1 } from "iso-639-3";
import { useCallback, useMemo } from "react";
import { Trans } from "react-i18next";

import { Toggle } from "@/components/buttons/Toggle";
import { FlagIcon } from "@/components/FlagIcon";
import { Icon, Icons } from "@/components/Icon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { SelectableLink } from "@/components/player/internals/ContextMenu/Links";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { usePlayerStore } from "@/stores/player/store";
import {
  SourceQuality,
  allQualities,
  qualityToString,
} from "@/stores/player/utils/qualities";
import {
  alternateSourceLabels,
  languagesByQuality,
  selectableQualityTiers,
} from "@/stores/player/utils/qualityStreams";
import { useQualityStore } from "@/stores/quality";
import { canPlayHlsNatively } from "@/utils/browser/detectFeatures";

const alwaysVisibleQualities: Record<SourceQuality, boolean> = {
  unknown: false,
  "360": true,
  "480": true,
  "720": true,
  "1080": true,
  "4k": true,
};

function flagCode(language: string): string {
  return language.length === 3
    ? (iso6393To1[language] ?? language)
    : language;
}

function QualityLanguageFlags({ languages }: { languages: string[] }) {
  if (!languages.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5 mr-1.5">
      {languages.map((lang) => (
        <span
          key={lang}
          className="inline-flex scale-[0.55] origin-center -mx-1"
          title={lang.toUpperCase()}
        >
          <FlagIcon langCode={flagCode(lang)} />
        </span>
      ))}
    </span>
  );
}

function useIsIosHls() {
  const sourceType = usePlayerStore((s) => s.source?.type);
  const result = useMemo(() => {
    const videoEl = document.createElement("video");
    if (sourceType !== "hls") return false;
    if (Hls.isSupported()) return false;
    if (!canPlayHlsNatively(videoEl)) return false;
    return true;
  }, [sourceType]);
  return result;
}

export function QualityView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const isIosHls = useIsIosHls();
  const sourceType = usePlayerStore((s) => s.source?.type);
  const availableQualities = usePlayerStore((s) => s.qualities);
  const alternateQualityOptions = usePlayerStore((s) => s.qualityStreamOptions);
  const currentQuality = usePlayerStore((s) => s.currentQuality);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const source = usePlayerStore((s) => s.source);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const switchQuality = usePlayerStore((s) => s.switchQuality);
  const switchQualityStream = usePlayerStore((s) => s.switchQualityStream);
  const enableAutomaticQuality = usePlayerStore(
    (s) => s.enableAutomaticQuality,
  );
  const setAutomaticQuality = useQualityStore((s) => s.setAutomaticQuality);
  const setLastChosenQuality = useQualityStore((s) => s.setLastChosenQuality);
  const autoQuality = useQualityStore((s) => s.quality.automaticQuality);
  const lastChosenQuality = useQualityStore((s) => s.quality.lastChosenQuality);

  const selectableQualities = useMemo(
    () => selectableQualityTiers(availableQualities, alternateQualityOptions),
    [availableQualities, alternateQualityOptions],
  );

  const alternateSourceNames = useMemo(
    () =>
      alternateSourceLabels({
        available: availableQualities,
        alternates: alternateQualityOptions,
        currentQuality,
        currentSourceId,
      }),
    [
      alternateQualityOptions,
      availableQualities,
      currentQuality,
      currentSourceId,
    ],
  );

  const qualityLanguages = useMemo(
    () =>
      languagesByQuality({
        available: availableQualities,
        currentLanguage:
          source?.audioLanguage?.trim() ||
          currentAudioTrack?.language ||
          null,
        alternates: alternateQualityOptions,
      }),
    [
      alternateQualityOptions,
      availableQualities,
      currentAudioTrack?.language,
      source?.audioLanguage,
    ],
  );

  const supportsAutoQuality = sourceType === "hls";

  const change = useCallback(
    (q: SourceQuality) => {
      setAutomaticQuality(false);
      setLastChosenQuality(q);
      if (availableQualities.includes(q)) {
        switchQuality(q);
      } else {
        switchQualityStream(q);
      }
      router.close();
    },
    [
      availableQualities,
      router,
      setAutomaticQuality,
      setLastChosenQuality,
      switchQuality,
      switchQualityStream,
    ],
  );

  const changeAutomatic = useCallback(() => {
    const newValue = !autoQuality;
    setAutomaticQuality(newValue);
    if (newValue) {
      enableAutomaticQuality();
      return;
    }

    const target =
      (currentQuality && currentQuality !== "unknown"
        ? currentQuality
        : null) ??
      lastChosenQuality ??
      availableQualities[0] ??
      null;
    if (target) {
      setLastChosenQuality(target);
      switchQuality(target);
    }
  }, [
    setAutomaticQuality,
    autoQuality,
    enableAutomaticQuality,
    currentQuality,
    lastChosenQuality,
    availableQualities,
    setLastChosenQuality,
    switchQuality,
  ]);

  const visibleQualities = allQualities.filter((quality) => {
    if (alwaysVisibleQualities[quality]) return true;
    if (selectableQualities.includes(quality)) return true;
    return false;
  });

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.quality.title")}
      </Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4">
        {visibleQualities.map((v) => {
          const selected = v === currentQuality;
          const sourceName = alternateSourceNames[v];
          const languages = qualityLanguages[v] ?? [];
          const hasRightMeta = Boolean(
            languages.length || sourceName || selected,
          );

          return (
            <SelectableLink
              key={v}
              selected={selected}
              onClick={
                selectableQualities.includes(v) ? () => change(v) : undefined
              }
              disabled={!selectableQualities.includes(v)}
              rightSide={
                hasRightMeta ? (
                  <span className="flex items-center">
                    <QualityLanguageFlags languages={languages} />
                    {sourceName ? (
                      <span className="text-video-context-type-secondary text-sm">
                        {sourceName}
                      </span>
                    ) : null}
                    {selected ? (
                      <Icon
                        icon={Icons.CIRCLE_CHECK}
                        className="text-xl text-video-context-type-accent ml-1.5"
                      />
                    ) : null}
                  </span>
                ) : undefined
              }
            >
              {qualityToString(v)}
            </SelectableLink>
          );
        })}
        {supportsAutoQuality && (
          <>
            <Menu.Divider />
            <Menu.Link
              rightSide={
                <Toggle onClick={changeAutomatic} enabled={autoQuality} />
              }
            >
              {t("player.menus.quality.automaticLabel")}
            </Menu.Link>
          </>
        )}
        <Menu.SmallText>
          <Trans
            i18nKey={
              isIosHls
                ? "player.menus.quality.iosNoQuality"
                : "player.menus.quality.hint"
            }
          >
            <Menu.Anchor onClick={() => router.navigate("/source")}>
              text
            </Menu.Anchor>
          </Trans>
        </Menu.SmallText>
      </Menu.Section>
    </>
  );
}
