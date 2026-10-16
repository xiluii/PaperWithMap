import { describe, expect, it } from 'vitest';
import type { Board, PaperData } from './types';
import { duplicateCards } from './canvas-commands';
import { changeLayout } from './model';

const board: Board = { id: 'board', title: 'test', description: '', color: 'green', mode: 'canvas', updatedAt: '', nodes: [
  { id: 'paper', type: 'paper', position: { x: 100, y: 150 }, selected: true, data: { title: 'Research', fileId: 'same-local-file', tags: ['test'], year: 2026 } as PaperData },
  { id: 'note', type: 'text', position: { x: 450, y: 200 }, selected: true, data: { title: 'Thought', html: '<p>note</p>', color: 'yellow', createdAt: '' } },
  { id: 'other', type: 'text', position: { x: 800, y: 200 }, data: { title: 'Other', html: '', color: 'white', createdAt: '' } },
  { id: 'section', type: 'section', position: { x: 0, y: 0 }, data: { title: '2026', subtitle: '' } },
], edges: [{ id: 'inside', source: 'paper', target: 'note', data: { relation: 'derived', directed: true } }, { id: 'outside', source: 'note', target: 'other' }] };

describe('duplicate cards through the context menu', () => {
  it('copies selected cards and their internal relationships, sharing files without mutating the original', () => {
    const result = duplicateCards(board, ['paper', 'note', 'section']);
    expect(result.ids).toHaveLength(2); expect(new Set(result.ids).size).toBe(2);
    expect(result.board.nodes).toHaveLength(6); expect(board.nodes).toHaveLength(4);
    const paper = result.board.nodes.find(node => node.id === result.ids[0])!;
    expect(paper.position).toEqual({ x: 140, y: 190 }); expect(paper.selected).toBe(true);
    expect(paper.data).toEqual(board.nodes[0].data); expect(paper.data).not.toBe(board.nodes[0].data);
    expect(result.board.edges).toHaveLength(3);
    expect(result.board.edges[2]).toMatchObject({ source: result.ids[0], target: result.ids[1], data: { relation: 'derived', directed: true } });
    expect(result.board.nodes.find(node => node.id === 'paper')?.selected).toBe(false);
    expect(board.nodes[0].selected).toBe(true);
  });
  it('retains a usable free-canvas position when duplicating in timeline mode', () => {
    const timeline = changeLayout(board, 'timeline'), result = duplicateCards(timeline, ['paper']);
    const restored = changeLayout(result.board, 'canvas');
    expect(restored.nodes.find(node => node.id === result.ids[0])?.position).toEqual({ x: 140, y: 190 });
    expect(result.board.mode).toBe('timeline');
  });
});
