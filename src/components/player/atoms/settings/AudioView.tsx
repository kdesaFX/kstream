import { iso6393To1 } from "iso-639-3";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { FlagIcon } from "@/components/FlagIcon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { AudioTrack } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { AudioStreamOption } from "@/stores/player/utils/audioStreams";
import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";

import { SelectableLink } from "../../internals/ContextMenu/Links";

export function AudioOption(props: {
  langCode?: string;
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <SelectableLink selected={props.selected} onClick={props.onClick}>
      <span className="flex items-center">
        <span data-code={props.langCode} className="mr-3 inline-flex">
          <FlagIcon langCode={props.langCode} />
        </span>
        <span>{props.children}</span>
      </span>
    </SelectableLink>
  );
}

function flagCode(language: string): string {
  return language.length === 3
    ? (iso6393To1[language] ?? language)
    : language;
}

export function AudioView({ id }: { id: string }) {
  const { t } = useTranslation();
  const unknownChoice = t("player.menus.subtitles.unknownLanguage");

  const router = useOverlayRouter(id);
  const audioTracks = usePlayerStore((s) => s.audioTracks);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const audioStreamOptions = usePlayerStore((s) => s.audioStreamOptions);
  const currentAudioStreamId = usePlayerStore((s) => s.currentAudioStreamId);
  const changeAudioTrack = usePlayerStore((s) => s.display?.changeAudioTrack);
  const switchAudioStream = usePlayerStore((s) => s.switchAudioStream);

  const changeHlsTrack = useCallback(
    (track: AudioTrack) => {
      changeAudioTrack?.(track);
      router.close();
    },
    [router, changeAudioTrack],
  );

  const changeStreamAudio = useCallback(
    (option: AudioStreamOption) => {
      switchAudioStream(option.id);
      router.close();
    },
    [router, switchAudioStream],
  );

  const hasStreamOptions = audioStreamOptions.length > 1;
  const hasHlsTracks = audioTracks.length > 1;

  const streamSectionTitle = useMemo(
    () => t("player.menus.audio.streamLanguages", "Audio language"),
    [t],
  );
  const trackSectionTitle = useMemo(
    () => t("player.menus.audio.trackLanguages", "Audio tracks"),
    [t],
  );

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>Audio</Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4 !pt-2">
        {hasStreamOptions && (
          <>
            <Menu.SectionTitle className="!pt-0 mb-1">
              {streamSectionTitle}
            </Menu.SectionTitle>
            {audioStreamOptions.map((opt) => (
              <AudioOption
                key={opt.id}
                selected={opt.id === currentAudioStreamId}
                langCode={flagCode(opt.language)}
                onClick={() => changeStreamAudio(opt)}
              >
                {opt.label ||
                  getPrettyLanguageNameFromLocale(opt.language) ||
                  unknownChoice}
              </AudioOption>
            ))}
          </>
        )}

        {hasHlsTracks && (
          <>
            {hasStreamOptions && (
              <Menu.SectionTitle className="mb-1 mt-3">
                {trackSectionTitle}
              </Menu.SectionTitle>
            )}
            {audioTracks.map((v) => (
              <AudioOption
                key={v.id}
                selected={v.id === currentAudioTrack?.id}
                langCode={flagCode(v.language)}
                onClick={() => changeHlsTrack(v)}
              >
                {getPrettyLanguageNameFromLocale(v.language) ??
                  v.label ??
                  unknownChoice}
              </AudioOption>
            ))}
          </>
        )}

        {!hasStreamOptions && !hasHlsTracks && (
          <p className="text-type-secondary text-sm px-1 py-2">
            {t(
              "player.menus.audio.noneAvailable",
              "No alternate audio languages available for this title.",
            )}
          </p>
        )}
      </Menu.Section>
    </>
  );
}
