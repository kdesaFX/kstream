import { useRef } from "react";

import { Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

export function Pause(props: { iconSizeClass?: string; className?: string }) {
  const display = usePlayerStore((s) => s.display);
  const { isPaused } = usePlayerStore((s) => s.mediaPlaying);
  const handledByPointerRef = useRef(false);

  const toggle = () => {
    if (isPaused) display?.play();
    else display?.pause();
  };

  return (
    <VideoPlayerButton
      className={props.className}
      iconSizeClass={props.iconSizeClass}
      // pointerdown keeps user-activation for unmuted play(); click alone can
      // lose it in Electron / strict autoplay policies.
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        handledByPointerRef.current = true;
        toggle();
      }}
      onClick={() => {
        if (handledByPointerRef.current) {
          handledByPointerRef.current = false;
          return;
        }
        toggle();
      }}
      icon={isPaused ? Icons.PLAY : Icons.PAUSE}
    />
  );
}
