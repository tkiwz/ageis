import type { DeepString } from "../types";

/** "governance" namespace, owned by WP5. Keys: governance.<page>.<section>.<item> */
export const governance = {};

export type GovernanceMessages = DeepString<typeof governance>;
