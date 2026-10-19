import type { DeepString } from "../types";

/** "assets" namespace, owned by WP2. Keys: assets.<page>.<section>.<item> */
export const assets = {};

export type AssetsMessages = DeepString<typeof assets>;
