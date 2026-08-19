import { ExternalListButtons } from "@/components/media/ExternalListButtons";
import { usePlayerStore } from "@/stores/player/store";
import { isAnimeTitle } from "@/utils/media/anime";

export function ExternalLists() {
  const meta = usePlayerStore((s) => s.meta);
  if (!meta || !isAnimeTitle(meta)) return null;

  return (
    <ExternalListButtons
      type="ANIME"
      variant="player"
      titles={[meta.originalTitle, meta.title]}
    />
  );
}
