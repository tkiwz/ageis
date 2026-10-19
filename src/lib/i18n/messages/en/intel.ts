import type { DeepString } from "../types";

/** "intel" namespace, owned by WP4. Keys: intel.<page>.<section>.<item> */
export const intel = {};

export type IntelMessages = DeepString<typeof intel>;
