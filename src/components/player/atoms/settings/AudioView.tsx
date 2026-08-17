import { iso6393To1 } from "iso-639-3";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { FlagIcon } from "@/components/FlagIcon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { AudioTrack } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { AudioStreamOption } from "@/stores/player/utils/audioStreams";
import {
  formatAudioTrackLabel,
  isUninformativeAudioTrack,
} from "@/utils/media/formatAudioTrackLabel";
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
  const selectHlsAudioTrack = usePlayerStore((s) => s.selectHlsAudioTrack);
  const switchAudioStream = usePlayerStore((s) => s.switchAudioStream);

  const changeHlsTrack = useCallback(
    (track: AudioTrack) => {
      selectHlsAudioTrack(track);
      router.close();
    },
    [router, selectHlsAudioTrack],
  );

  const changeStreamAudio = useCallback(
    (option: AudioStreamOption) => {
      switchAudioStream(option.id);
      router.close();
    },
    [router, switchAudioStream],
  );

  // One flat list: cross-source streams + in-manifest HLS tracks, no dividers.
  const streamOptions = audioStreamOptions;
  // A single track the manifest never named isn't a choice, it's a riddle:
  // there's nothing to switch to, so say so rather than listing "Audio 1".
  const soleUnnamedTrack =
    streamOptions.length === 0 &&
    audioTracks.length === 1 &&
    isUninformativeAudioTrack(audioTracks[0].language, audioTracks[0].label);
  const hlsTracks = soleUnnamedTrack ? [] : audioTracks;
  const hasAny = streamOptions.length + hlsTracks.length > 0;

  // Stream-option selection wins until the user picks an HLS track (which
  // clears currentAudioStreamId). Avoids dual checkmarks / stale Korean ticks.
  const streamSelected = Boolean(
    currentAudioStreamId &&
      streamOptions.some((opt) => opt.id === currentAudioStreamId),
  );

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.settings.audioItem")}
      </Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4 !pt-0">
        {streamOptions.map((opt) => (
          <AudioOption
            key={`stream:${opt.id}`}
            selected={opt.id === currentAudioStreamId}
            langCode={flagCode(opt.language)}
            onClick={() => changeStreamAudio(opt)}
          >
            {formatAudioTrackLabel(
              opt.language,
              opt.label ||
                getPrettyLanguageNameFromLocale(opt.language) ||
                undefined,
              unknownChoice,
            )}
          </AudioOption>
        ))}

        {hlsTracks.map((v, index) => (
          <AudioOption
            key={`hls:${v.id}`}
            selected={!streamSelected && v.id === currentAudioTrack?.id}
            langCode={
              v.language &&
              v.language !== "unknown" &&
              v.language !== "und"
                ? flagCode(v.language)
                : undefined
            }
            onClick={() => changeHlsTrack(v)}
          >
            {formatAudioTrackLabel(
              v.language,
              v.label,
              // Ordinal beats the manifest's own numbering, which is arbitrary
              // and often starts at 1 on the second track.
              t("player.menus.audio.numberedTrack", { number: index + 1 }),
            )}
          </AudioOption>
        ))}

        {!hasAny && (
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
