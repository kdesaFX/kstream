import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";

const CHANNEL_RE = /\b(5\.1|7\.1|2\.0|atmos|dts|surround|stereo)\b/i;

/**
 * Manifest names that name nothing: "Audio 1", "Track 2", "A1", "default".
 * Packagers emit these when no language was set, and passing them through
 * turned the language menu into a list of numbers.
 */
const PLACEHOLDER_LABEL_RE = /^(?:audio|track|stream|a|und|unknown|default)?[\s._-]*\d*$/i;

function isBlankLanguage(language?: string | null): boolean {
  const lang = language?.trim().toLowerCase();
  return !lang || lang === "unknown" || lang === "und";
}

function isPlaceholderLabel(label?: string | null): boolean {
  const trimmed = label?.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_LABEL_RE.test(trimmed);
}

/** True when a track tells the viewer nothing: no language, no real name. */
export function isUninformativeAudioTrack(
  language?: string,
  label?: string,
): boolean {
  if (!isBlankLanguage(language)) return false;
  if (CHANNEL_RE.test(label ?? "")) return false;
  return isPlaceholderLabel(label);
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
    if (!isPlaceholderLabel(cleaned)) {
      return `${cleaned} (${channel})`;
    }
    return `Surround (${channel})`;
  }

  const trimmedLabel = label?.trim();
  if (trimmedLabel && !isPlaceholderLabel(trimmedLabel)) {
    return trimmedLabel;
  }

  return unknownFallback;
}
