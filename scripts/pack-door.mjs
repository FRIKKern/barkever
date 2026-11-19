import { fileURLToPath } from "node:url";

export * from "../conformance/pack/conformance.mjs";
export const PACK_DIR = "conformance/pack";
export const PACK_PATH = fileURLToPath(new URL("../conformance/pack", import.meta.url));
