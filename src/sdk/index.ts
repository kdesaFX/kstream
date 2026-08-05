/**
 * COMMENT export * from "./mock"; IF running in prod  
 * COMMENT export * from "@p-stream/providers"; IF running locally
 */
export * from "@p-stream/providers";
// export * from "./mock";

// Not yet in the installed @p-stream/providers build — re-export mocks until upstream ships them.
export {
  fetchGridData,
  getArtemisVariantMeta,
  getVariantMeta,
  resolveArtemisVariant,
  resolveVariant,
} from "./mock";
export type {
  ArtemisFileVariant,
  ArtemisVariantMeta,
  FileVariant,
  GridData,
  GridDownload,
  GridDownloadSource,
  ResolveVariantResult,
  VariantMeta,
  VariantStream,
  VariantSubtitle,
} from "./mock";
