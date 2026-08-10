import { Spinner } from "@/components/layout/Spinner";
import { usePlayerStore } from "@/stores/player/store";

export function LoadingSpinner() {
  const isLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const hasPlayedOnce = usePlayerStore((s) => s.mediaPlaying.hasPlayedOnce);
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);

  if (!isLoading) return null;
  // Prefer the center play button over a stuck spinner before first play.
  if (!hasPlayedOnce && isPaused) return null;

  return <Spinner className="text-4xl" />;
}
