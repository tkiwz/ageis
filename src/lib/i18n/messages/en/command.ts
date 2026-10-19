import type { DeepString } from "../types";

/** "command" namespace, owned by WP2. Keys: command.<page>.<section>.<item> */
export const command = {};

export type CommandMessages = DeepString<typeof command>;
