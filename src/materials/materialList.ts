import type { BlockState } from '../parser/types';
import { displayName } from './names';
import { formatBreakdown, itemsForState, stackSize, breakdown } from './items';

export interface MaterialEntry {
  item: string;
  name: string;
  total: number;
  stack: number;
  /** Palette ids whose blocks require this item (for highlighting). */
  paletteIds: number[];
}

/** Builds the material list from per-palette block counts. */
export function buildMaterialList(palette: BlockState[], counts: ArrayLike<number>): MaterialEntry[] {
  const map = new Map<string, MaterialEntry>();
  for (let id = 1; id < palette.length; id++) {
    const n = counts[id];
    if (!n) continue;
    for (const { item, count } of itemsForState(palette[id])) {
      let e = map.get(item);
      if (!e) {
        e = { item, name: displayName(item), total: 0, stack: stackSize(item), paletteIds: [] };
        map.set(item, e);
      }
      e.total += n * count;
      if (!e.paletteIds.includes(id)) e.paletteIds.push(id);
    }
  }
  return [...map.values()];
}

export type SortKey = 'count' | 'name' | 'status';

export function sortMaterials(list: MaterialEntry[], key: SortKey, collected: Set<string>): MaterialEntry[] {
  const byName = (a: MaterialEntry, b: MaterialEntry) => a.name.localeCompare(b.name, 'en');
  const byCount = (a: MaterialEntry, b: MaterialEntry) => b.total - a.total || byName(a, b);
  const sorted = list.slice();
  if (key === 'name') sorted.sort(byName);
  else if (key === 'count') sorted.sort(byCount);
  else sorted.sort((a, b) => Number(collected.has(a.item)) - Number(collected.has(b.item)) || byCount(a, b));
  return sorted;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(list: MaterialEntry[], collected: Set<string>): string {
  const rows = [['Item', 'Item ID', 'Total', 'Shulker Boxes', 'Stacks', 'Items', 'Stack Size', 'Collected']];
  for (const e of list) {
    const b = breakdown(e.total, e.stack);
    rows.push([
      e.name,
      e.item.includes(':') ? e.item : `minecraft:${e.item}`,
      String(e.total),
      String(b.shulkers),
      String(e.stack > 1 ? b.stacks : 0),
      String(e.stack > 1 ? b.items : b.items + b.stacks),
      String(e.stack),
      collected.has(e.item) ? 'yes' : 'no',
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function toText(list: MaterialEntry[], collected: Set<string>, title: string): string {
  const total = list.reduce((s, e) => s + e.total, 0);
  const width = Math.min(40, Math.max(10, ...list.map((e) => e.name.length)));
  const lines = [`Material List - ${title}`, `${list.length} types, ${total.toLocaleString('en-US')} items`, ''];
  for (const e of list) {
    const mark = collected.has(e.item) ? '[x]' : '[ ]';
    const count = e.total.toLocaleString('en-US').padStart(9);
    lines.push(`${mark} ${e.name.padEnd(width)} ${count}  = ${formatBreakdown(e.total, e.stack)}`);
  }
  return lines.join('\n') + '\n';
}
