import { useCallback, useEffect, useMemo } from "react";

import { usePlayerStore } from "@/stores/player/store";
import { useSubtitleStore } from "@/stores/subtitles";
import { useVolumeStore } from "@/stores/volume";

import { useCaptions } from "./useCaptions";

export function useInitializePlayer() {
  const display = usePlayerStore((s) => s.display);
  const volume = useVolumeStore((s) => s.volume);

  const init = useCallback(() => {
    display?.setVolume(volume);
  }, [display, volume]);

  return {
    init,
  };
}

export function useInitializeSource() {
  const source = usePlayerStore((s) => s.source);
  const sourceIdentifier = useMemo(
    () => (source ? JSON.stringify(source) : null),
    [source],
  );
  const enabled = useSubtitleStore((s) => s.enabled);
  const { selectLastUsedLanguageIfEnabled, disable } = useCaptions();

  useEffect(() => {
    if (!sourceIdentifier) return;
    if (enabled) {
      void selectLastUsedLanguageIfEnabled();
    } else {
      void disable();
    }
  }, [sourceIdentifier, enabled, selectLastUsedLanguageIfEnabled, disable]);
}
