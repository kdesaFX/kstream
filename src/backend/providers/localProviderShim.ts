// TEMPORARY local shim for @p-stream/providers APIs not present in the
// currently installed package version (private repo, no access yet).
// Mirrors the upstream types/signatures so callers need no logic changes.
// Remove this file and point imports back at "@p-stream/providers" once
// the real package exports these.

export type FileVariant = {
  fid: string;
  name: string;
  size: string;
  quality?: string;
  codec?: string;
  tag?: string;
};

export type VariantMeta = {
  variants: FileVariant[];
  shareKey: string;
};

export type VariantStream = {
  url: string;
  type: "hls" | "mp4";
};

export type VariantSubtitle = {
  subtitle_link: string;
};

export type ResolveVariantResult = {
  streams: Record<string, VariantStream>;
  subtitles?: Record<string, VariantSubtitle>;
};

export function getVariantMeta(): VariantMeta | null {
  return null;
}

export async function resolveVariant(
  _fid: string,
  _shareKey: string,
  _token: string,
): Promise<ResolveVariantResult | null> {
  return null;
}

export type ArtemisFileVariant = FileVariant;

export type ArtemisVariantMeta = {
  variants: ArtemisFileVariant[];
};

export function getArtemisVariantMeta(): ArtemisVariantMeta | null {
  return null;
}

export function resolveArtemisVariant(_fid: string): { url: string } | null {
  return null;
}

export type GridDownloadSource = {
  url: string;
  name: string;
};

export type GridDownload = {
  title: string;
  format?: string;
  resolution?: string;
  size?: string;
  sources: GridDownloadSource[];
};

export type GridData = {
  downloads: GridDownload[];
};

export async function fetchGridData(_tmdbId: string): Promise<GridData> {
  return { downloads: [] };
}
