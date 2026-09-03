import { iso6393To1 } from "iso-639-3";
import { useCallback, useMemo } from "react";

import { FlagIcon } from "@/components/FlagIcon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { SelectableLink } from "@/components/player/internals/ContextMenu/Links";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { usePlayerStore } from "@/stores/player/store";
import {
  SourceQuality,
  qualityToString,
} from "@/stores/player/utils/qualities";
import {
  QualityTierChoice,
  choicesForQualityTier,
} from "@/stores/player/utils/qualityStreams";
import { useQualityStore } from "@/stores/quality";

function flagCode(language: string): string {
  return language.length === 3
    ? (iso6393To1[language] ?? language)
    : language;
}

function SourceLanguageFlag({ languages }: { languages: string[] }) {
  const lang = languages[0];
  if (!lang) return null;
  return (
    <span className="mr-3 inline-flex">
      <FlagIcon langCode={flagCode(lang)} />
    </span>
  );
}

function isChoiceSelected(
  choice: QualityTierChoice,
  currentQuality: SourceQuality | null,
  currentSourceId: string | null,
): boolean {
  if (choice.kind === "current") {
    return (
      currentQuality === choice.quality &&
      currentSourceId === choice.sourceId
    );
  }
  return (
    currentQuality === choice.option.quality &&
    currentSourceId === choice.option.sourceId
  );
}

export function QualitySourceView({
  id,
  quality,
}: {
  id: string;
  quality: SourceQuality;
}) {
  const router = useOverlayRouter(id);
  const availableQualities = usePlayerStore((s) => s.qualities);
  const alternateQualityOptions = usePlayerStore((s) => s.qualityStreamOptions);
  const currentQuality = usePlayerStore((s) => s.currentQuality);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const source = usePlayerStore((s) => s.source);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const switchQuality = usePlayerStore((s) => s.switchQuality);
  const switchQualityStreamOption = usePlayerStore(
    (s) => s.switchQualityStreamOption,
  );
  const setLastChosenQuality = useQualityStore((s) => s.setLastChosenQuality);
  const setAutomaticQuality = useQualityStore((s) => s.setAutomaticQuality);

  const choices = useMemo(
    () =>
      choicesForQualityTier({
        quality,
        available: availableQualities,
        alternates: alternateQualityOptions,
        currentSourceId,
        currentLanguage:
          source?.audioLanguage?.trim() ||
          currentAudioTrack?.language ||
          null,
      }),
    [
      alternateQualityOptions,
      availableQualities,
      currentAudioTrack?.language,
      currentSourceId,
      quality,
      source?.audioLanguage,
    ],
  );

  const applyChoice = useCallback(
    (choice: QualityTierChoice) => {
      setAutomaticQuality(false);
      setLastChosenQuality(quality);
      if (choice.kind === "current") {
        switchQuality(quality);
      } else {
        switchQualityStreamOption(choice.option.id);
      }
      router.close();
    },
    [
      quality,
      router,
      setAutomaticQuality,
      setLastChosenQuality,
      switchQuality,
      switchQualityStreamOption,
    ],
  );

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/quality")}>
        {qualityToString(quality)}
      </Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4">
        {choices.map((choice) => {
          const selected = isChoiceSelected(
            choice,
            currentQuality,
            currentSourceId,
          );
          const sourceName =
            choice.kind === "current"
              ? choice.sourceName
              : choice.option.sourceName;
          const languages =
            choice.kind === "current"
              ? choice.languages
              : choice.option.languages;

          return (
            <SelectableLink
              key={
                choice.kind === "current"
                  ? `current:${choice.sourceId}`
                  : choice.option.id
              }
              selected={selected}
              onClick={() => applyChoice(choice)}
            >
              <span className="flex items-center">
                <SourceLanguageFlag languages={languages} />
                <span>{sourceName}</span>
              </span>
            </SelectableLink>
          );
        })}
      </Menu.Section>
    </>
  );
}
