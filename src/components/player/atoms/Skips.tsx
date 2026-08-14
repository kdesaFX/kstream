import { useCallback } from "react";

import { Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

export function SkipForward(props: {
  iconSizeClass?: string;
  inControl: boolean;
}) {
  const display = usePlayerStore((s) => s.display);
  const commit = useCallback(() => {
    const t = usePlayerStore.getState().progress.time;
    display?.setTime(t + 10);
  }, [display]);
  if (!props.inControl) return null;
  return (
    <VideoPlayerButton
      iconSizeClass={props.iconSizeClass}
      onClick={commit}
      icon={Icons.SKIP_FORWARD}
    />
  );
}

export function SkipBackward(props: {
  iconSizeClass?: string;
  inControl: boolean;
}) {
  const display = usePlayerStore((s) => s.display);
  const commit = useCallback(() => {
    const t = usePlayerStore.getState().progress.time;
    display?.setTime(t - 10);
  }, [display]);
  if (!props.inControl) return null;
  return (
    <VideoPlayerButton
      iconSizeClass={props.iconSizeClass}
      onClick={commit}
      icon={Icons.SKIP_BACKWARD}
    />
  );
}
