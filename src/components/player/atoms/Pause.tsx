import { useRef } from "react";

import { Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

export function Pause(props: { iconSizeClass?: string; className?: string }) {
  const display = usePlayerStore((s) => s.display);
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const handledPointerRef = useRef(false);

  const toggle = () => {
    // Read live state — stale React closures flip the wrong way.
    const paused = usePlayerStore.getState().mediaPlaying.isPaused;
    if (paused) display?.play();
    else display?.pause();
  };

  return (
    <VideoPlayerButton
      className={props.className}
      iconSizeClass={props.iconSizeClass}
      onPointerDown={(e) => {
        // Same-tick gesture for unmuted play (Electron / Safari).
        if (e.button !== 0) return;
        handledPointerRef.current = true;
        toggle();
      }}
      onClick={() => {
        // Keyboard / accessibility activation only — pointer already handled.
        if (handledPointerRef.current) {
          handledPointerRef.current = false;
          return;
        }
        toggle();
      }}
      icon={isPaused ? Icons.PLAY : Icons.PAUSE}
    />
  );
}
