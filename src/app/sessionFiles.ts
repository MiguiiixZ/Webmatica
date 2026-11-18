/** Files opened during this session, kept in memory so they open even without IndexedDB. */
export const sessionFiles = new Map<string, { name: string; bytes: Uint8Array }>();
