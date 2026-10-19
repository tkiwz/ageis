/** Every leaf of an English namespace becomes `string` for its Arabic twin. */
export type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
