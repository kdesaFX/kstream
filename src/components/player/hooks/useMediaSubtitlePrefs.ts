import { useEffect, useRef } from "react";

import { getMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { useSubtitleStore } from "@/stores/subtitles";

/**
 * Persist and restore subtitle delay / track choice per movie or episode.
 * Must run before useInitializeSource so caption auto-select sees restored prefs.
 */
export function useMediaSubtitlePrefs() {
  const meta = usePlayerStore((s) => s.meta);
  const mediaKey = getMediaKey(meta);

  const delay = useSubtitleStore((s) => s.delay);
  const enabled = useSubtitleStore((s) => s.enabled);
  const language = useSubtitleStore((s) => s.lastSelectedLanguage);
  const subtitleId = useSubtitleStore((s) => s.lastSelectedSubtitleId);
  const overrideCasing = useSubtitleStore((s) => s.overrideCasing);
  const applyPrefsForMedia = useSubtitleStore((s) => s.applyPrefsForMedia);
  const savePrefsForMedia = useSubtitleStore((s) => s.savePrefsForMedia);

  const appliedKeyRef = useRef<string | null>(null);
  const skipSaveRef = useRef(false);

  // Restore when the movie / episode changes.
  useEffect(() => {
    if (!mediaKey) {
      appliedKeyRef.current = null;
      return;
    }
    if (appliedKeyRef.current === mediaKey) return;

    skipSaveRef.current = true;
    applyPrefsForMedia(mediaKey);
    appliedKeyRef.current = mediaKey;

    // Allow saves after Zustand subscribers flush the restored values.
    const t = window.setTimeout(() => {
      skipSaveRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [mediaKey, applyPrefsForMedia]);

  // Save whenever prefs change while watching this media.
  useEffect(() => {
    if (!mediaKey) return;
    if (appliedKeyRef.current !== mediaKey) return;
    if (skipSaveRef.current) return;
    savePrefsForMedia(mediaKey);
  }, [
    mediaKey,
    delay,
    enabled,
    language,
    subtitleId,
    overrideCasing,
    savePrefsForMedia,
  ]);
}
