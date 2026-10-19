import type { DeepString } from "../types";

/** "mobile" namespace, owned by WP3. Keys: mobile.<page>.<section>.<item> */
export const mobile = {};

export type MobileMessages = DeepString<typeof mobile>;
