import type { DeepString } from "../types";

/** "safety" namespace, owned by WP3. Keys: safety.<page>.<section>.<item> */
export const safety = {};

export type SafetyMessages = DeepString<typeof safety>;
