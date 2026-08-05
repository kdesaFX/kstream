/**
 * COMMENT export * from "./mock"; IF running in prod  
 * COMMENT export * from "@p-stream/providers"; IF running locally
 */
export * from "@p-stream/providers";
// export * from "./mock";

// Not yet in the installed @p-stream/providers build — re-export mocks until upstream ships them.
export { fetchGridData } from "./mock";
export type { GridData, GridDownload, GridDownloadSource } from "./mock";
