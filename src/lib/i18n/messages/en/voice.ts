import type { DeepString } from "../types";

/** "voice" namespace, owned by WP3. Keys: voice.<page>.<section>.<item> */
export const voice = {};

export type VoiceMessages = DeepString<typeof voice>;
