import { describe, expect, it } from 'vitest';
import { allocatePanes, clampPanelSize, defaultReadingWeights, movePane, readingMinimums, validPaneOrder } from './panel-layout';
import type { ReadingPaneId } from './panel-layout';

describe('reading pane layout', () => {
  const panes: ReadingPaneId[] = ['document', 'notes', 'ai'];
  it('keeps three readable panes within the available desktop width', () => {
    for (const width of [1000, 1240, 1920, 3840]) {
      const sizes = allocatePanes(width, panes, defaultReadingWeights);
      for (const id of panes) expect(sizes[id]).toBeGreaterThanOrEqual(readingMinimums[id]);
      expect(Object.values(sizes).reduce((sum, value) => sum + value, 0)).toBeCloseTo(width);
    }
  });
  it('redistributes only the visible panes and handles a narrow viewport without negative sizes', () => {
    const single = allocatePanes(800, ['ai'], defaultReadingWeights);
    expect(single).toEqual({ document: 0, notes: 0, ai: 800 });
    const small = allocatePanes(400, panes, defaultReadingWeights);
    expect(small).toEqual(readingMinimums);
    const two = allocatePanes(1000, ['document', 'ai'], defaultReadingWeights);
    expect(two.notes).toBe(0);
    expect(two.document + two.ai).toBeCloseTo(1000);
  });
  it('keeps a resized adjacent pair stable when storing its resulting proportions', () => {
    const widths = { document: 650, notes: 310, ai: 340 }, total = 1300;
    expect(allocatePanes(total, panes, { document: widths.document / total, notes: widths.notes / total, ai: widths.ai / total })).toEqual(widths);
  });
  it('rejects duplicate, missing and unknown pane order from browser storage', () => {
    for (const invalid of [null, [], ['ai', 'notes'], ['ai', 'ai', 'document'], ['notes', 'document', 'other']]) expect(validPaneOrder(invalid)).toEqual(panes);
    expect(validPaneOrder(['ai', 'document', 'notes'])).toEqual(['ai', 'document', 'notes']);
  });
  it('moves in either direction without losing or duplicating a pane', () => {
    const moved = movePane(panes, 'ai', 'document');
    expect(moved).toEqual(['ai', 'document', 'notes']);
    expect(movePane(moved, 'ai', 'notes')).toEqual(['document', 'notes', 'ai']);
    expect(panes).toEqual(['document', 'notes', 'ai']);
  });
  it('clamps sizes at both edges, including invalid or inverted limits', () => {
    expect(clampPanelSize(100, 240, 560)).toBe(240);
    expect(clampPanelSize(800, 240, 560)).toBe(560);
    expect(clampPanelSize(NaN, 240, 560)).toBe(240);
    expect(clampPanelSize(300, 240, 200)).toBe(240);
  });
});
