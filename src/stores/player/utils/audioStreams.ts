import { Stream } from "@p-stream/providers";

import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import { CaptionListItem } from "@/stores/player/slices/source";
import { SourceSliceSource } from "@/stores/player/utils/qualities";

/** Pick a stream matching the user's preferred audio language, else fallback. */
export function pickPreferredAudioStream(
  streams: Stream[],
  preferredLanguage: string | null | undefined,
  fallback?: Stream,
): Stream {
  const preferred = preferredLanguage?.trim();
  if (preferred) {
    const match = streams.find(
      (stream) => stream.audioLanguage?.trim() === preferred,
    );
    if (match) return match;
  }
  return fallback ?? streams[0];
}

export type AudioStreamOption = {
  /** Unique key for this option */
  id: string;
  language: string;
  label: string;
  sourceId: string;
  embedId?: string | null;
  source: SourceSliceSource;
  captions: CaptionListItem[];
};

export function streamToAudioOption(
  stream: Stream,
  sourceId: string,
  embedId?: string | null,
): AudioStreamOption | null {
  const language = stream.audioLanguage?.trim();
  if (!language) return null;

  const label =
    stream.audioLabel?.trim() ||
    (language === "ja"
      ? "Japanese"
      : language === "en"
        ? "English"
        : language === "es"
          ? "Spanish"
          : language.toUpperCase());

  // Latino / Castellano are both just Spanish in the chooser
  const displayLabel =
    language === "es" || /^spanish\b/i.test(label) ? "Spanish" : label;

  return {
    id: `${sourceId}:${embedId ?? "direct"}:${stream.id}:${language}`,
    language,
    label: displayLabel,
    sourceId,
    embedId: embedId ?? null,
    source: convertRunoutputToSource({ stream }),
    captions: convertProviderCaption(stream.captions),
  };
}

/** Prefer one option per language; keep first occurrence (higher-ranked). */
export function mergeAudioStreamOptions(
  existing: AudioStreamOption[],
  incoming: AudioStreamOption[],
): AudioStreamOption[] {
  const byLang = new Map<string, AudioStreamOption>();
  for (const opt of existing) {
    if (!byLang.has(opt.language)) byLang.set(opt.language, opt);
  }
  for (const opt of incoming) {
    if (!byLang.has(opt.language)) byLang.set(opt.language, opt);
  }
  return Array.from(byLang.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function streamsToAudioOptions(
  streams: Stream[] | undefined,
  sourceId: string,
  embedId?: string | null,
): AudioStreamOption[] {
  if (!streams?.length) return [];
  const options: AudioStreamOption[] = [];
  for (const stream of streams) {
    const opt = streamToAudioOption(stream, sourceId, embedId);
    if (opt) options.push(opt);
  }
  return mergeAudioStreamOptions([], options);
}
