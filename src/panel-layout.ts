export type DockSide = 'left' | 'right';
export const readingPaneIds = ['document', 'notes', 'ai'] as const;
export type ReadingPaneId = typeof readingPaneIds[number];
export const readingMinimums: Record<ReadingPaneId, number> = { document: 360, notes: 300, ai: 340 };
export const defaultReadingWeights = { document: .48, notes: .25, ai: .27 };

export function clampPanelSize(value: number, min: number, max: number) {
  return Math.min(Math.max(min, max), Math.max(min, Number.isFinite(value) ? value : min));
}
export function validPaneOrder(value: unknown): ReadingPaneId[] {
  return Array.isArray(value) && value.length === 3 && new Set(value).size === 3 && value.every(id => readingPaneIds.includes(id))
    ? value : [...readingPaneIds];
}
export function movePane(order: ReadingPaneId[], id: ReadingPaneId, target: ReadingPaneId) {
  const next = [...order], from = next.indexOf(id), to = next.indexOf(target);
  if (from < 0 || to < 0) return next;
  next.splice(from, 1); next.splice(to, 0, id); return next;
}
// Allocate the remaining space proportionally after satisfying each visible pane's minimum.
export function allocatePanes(total: number, ids: ReadingPaneId[], weights: Record<ReadingPaneId, number>) {
  const result = { document: 0, notes: 0, ai: 0 }, pending = new Set(ids);
  let remaining = Math.max(total, ids.reduce((sum, id) => sum + readingMinimums[id], 0));
  while (pending.size) {
    const sum = [...pending].reduce((value, id) => value + (Number.isFinite(weights[id]) && weights[id] > 0 ? weights[id] : 1), 0);
    const small = [...pending].filter(id => remaining * (weights[id] > 0 && Number.isFinite(weights[id]) ? weights[id] : 1) / sum < readingMinimums[id]);
    if (!small.length) { for (const id of pending) result[id] = remaining * (weights[id] > 0 && Number.isFinite(weights[id]) ? weights[id] : 1) / sum; break; }
    for (const id of small) { result[id] = readingMinimums[id]; remaining -= result[id]; pending.delete(id); }
  }
  return result;
}
