import { useRef } from "react";

import { Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

export function Pause(props: { iconSizeClass?: string; className?: string }) {
  const display = usePlayerStore((s) => s.display);
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const handledPointerRef = useRef(false);

  const toggle = () => {
    const paused = usePlayerStore.getState().mediaPlaying.isPaused;
    if (paused) display?.play();
    else display?.pause();
  };

  return (
    <VideoPlayerButton
      className={props.className}
      iconSizeClass={props.iconSizeClass}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Keep this gesture on the button — a pointerup on the video layer
        // used to schedule an immediate pause and make resume feel broken.
        e.stopPropagation();
        handledPointerRef.current = true;
        toggle();
      }}
      onClick={() => {
        // Keyboard / accessibility only. Pointer already handled above.
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
