/**
 * COMMENT export * from "./mock"; IF running in prod  
 * COMMENT export * from "@p-stream/providers"; IF running locally
 */
export * from "@p-stream/providers";
export {
	fetchGridData,
	getArtemisVariantMeta,
	getVariantMeta,
	resolveArtemisVariant,
	resolveVariant,
} from "./mock";

export type {
	ArtemisFileVariant,
	FileVariant,
	GridData,
} from "./mock";
 