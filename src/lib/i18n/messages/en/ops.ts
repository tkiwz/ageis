import type { DeepString } from "../types";

/** "ops" namespace, owned by WP1. Keys: ops.<page>.<section>.<item> */
export const ops = {};

export type OpsMessages = DeepString<typeof ops>;
