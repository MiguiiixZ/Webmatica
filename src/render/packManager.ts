/**
 * Holds the user-selected texture pack (client.jar or resource pack), if any.
 * When none is selected the bundled default pack is used.
 */
import type { ModelProvider } from './blockTables';
import type { TexturePack } from './texturePack';

export interface UserPack extends TexturePack {
  /** Block models read from the pack (client.jar), if it has them. */
  models?: ModelProvider;
}

let active: UserPack | null = null;
const listeners = new Set<() => void>();

export function getActivePack(): UserPack | null {
  return active;
}

export function setActivePack(p: UserPack | null): void {
  active = p;
  for (const l of listeners) l();
}

export function onPackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function modelProviderFor(pack: TexturePack | null): ModelProvider | null {
  return (pack as UserPack | null)?.models ?? null;
}
