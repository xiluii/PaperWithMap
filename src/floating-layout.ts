export type FloatingPosition = { x: number; y: number };
export function clampFloating(position: FloatingPosition, area: { width: number; height: number }, toolbar: { width: number; height: number }) {
  return { x: Math.max(8, Math.min(area.width - toolbar.width - 8, Number.isFinite(position.x) ? position.x : 8)), y: Math.max(8, Math.min(area.height - toolbar.height - 8, Number.isFinite(position.y) ? position.y : 8)) };
}
export function studyDimensions(width: number, height: number, columnRatio: number, rowRatio: number, mainMin: number, sideMin: number, topMin: number, bottomMin: number) {
  const main = Math.max(mainMin, Math.min(width - sideMin - 1, (width - 1) * columnRatio)), side = width - main - 1;
  const minRow = Math.min(topMin, Math.max(80, (height - 1) / 2)), maxRow = Math.max(minRow, height - Math.min(bottomMin, Math.max(80, (height - 1) / 2)) - 1);
  const top = Math.max(minRow, Math.min(maxRow, (height - 1) * rowRatio));
  return { main, side, top, bottom: height - top - 1, minRow, maxRow };
}
