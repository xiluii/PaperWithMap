import type { AppNode, Board } from './types';
import { changeLayout, now, uid } from './model';

export function duplicateCards(board: Board, selectedIds: string[]) {
  const selected = new Set(selectedIds), originals = board.nodes.filter(node => node.type !== 'section' && selected.has(node.id));
  const ids = new Map(originals.map(node => [node.id, uid()]));
  const copies = originals.map(node => ({ ...structuredClone(node), id: ids.get(node.id)!, selected: true, dragging: false, position: { x: node.position.x + 40, y: node.position.y + 40 } } as AppNode));
  const edges = board.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({ ...structuredClone(edge), id: uid(), source: ids.get(edge.source)!, target: ids.get(edge.target)!, selected: false }));
  const freePositions = board.freePositions && { ...board.freePositions, ...Object.fromEntries(originals.map(node => { const position = board.freePositions![node.id] || node.position; return [ids.get(node.id)!, { x: position.x + 40, y: position.y + 40 }]; })) };
  const next = { ...board, nodes: [...board.nodes.map(node => ({ ...node, selected: false })), ...copies], edges: [...board.edges, ...edges], freePositions, updatedAt: now() };
  return { board: board.mode === 'canvas' ? next : changeLayout(next, board.mode), ids: copies.map(node => node.id) };
}
