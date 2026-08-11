export function shouldStartExternalSubtitleScrape(
  mediaKey: string | null,
  attemptedMediaKey: string | null,
): mediaKey is string {
  return mediaKey !== null && mediaKey !== attemptedMediaKey;
}

export function mergeUniqueCaptions<T extends { id: string }>(
  providerCaptions: T[],
  externalCaptions: T[],
): T[] {
  const providerCaptionIds = new Set(
    providerCaptions.map((caption) => caption.id),
  );
  return [
    ...providerCaptions,
    ...externalCaptions.filter(
      (caption) => !providerCaptionIds.has(caption.id),
    ),
  ];
}
