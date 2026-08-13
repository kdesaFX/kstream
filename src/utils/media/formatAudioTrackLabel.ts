import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";

const CHANNEL_RE = /\b(5\.1|7\.1|2\.0|atmos|dts|surround|stereo)\b/i;

function isBlankLanguage(language?: string | null): boolean {
  const lang = language?.trim().toLowerCase();
  return !lang || lang === "unknown" || lang === "und";
}

/**
 * Human label for an audio chooser row.
 * HLS often ships channel-only tracks named "5.1" with no language — show
 * those as Surround (5.1) instead of "Unknown (5.1)".
 */
export function formatAudioTrackLabel(
  language: string | undefined,
  label: string | undefined,
  unknownFallback: string,
): string {
  const channelMatch = label?.match(CHANNEL_RE);
  const channel = channelMatch?.[1];
  const pretty = !isBlankLanguage(language)
    ? getPrettyLanguageNameFromLocale(language!)
    : null;

  if (pretty) {
    return channel ? `${pretty} (${channel})` : pretty;
  }

  if (channel) {
    const cleaned = (label || "")
      .replace(CHANNEL_RE, "")
      .replace(/[()[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !/^unknown$/i.test(cleaned)) {
      return `${cleaned} (${channel})`;
    }
    return `Surround (${channel})`;
  }

  const trimmedLabel = label?.trim();
  if (trimmedLabel && !/^unknown$/i.test(trimmedLabel)) {
    return trimmedLabel;
  }

  return unknownFallback;
}
