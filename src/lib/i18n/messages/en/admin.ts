import type { DeepString } from "../types";

/** "admin" namespace, owned by WP5. Keys: admin.<page>.<section>.<item> */
export const admin = {};

export type AdminMessages = DeepString<typeof admin>;
