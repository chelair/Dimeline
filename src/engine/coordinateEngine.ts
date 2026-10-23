import { addDays, diffDays } from './dateEngine';
export const MARGIN = 110;
export interface Coordinates {
  start: string;
  end: string;
  contentWidth: number;
  margin?: number;
}
export const dateToWorldX = (date: string, c: Coordinates) =>
  (c.margin ?? MARGIN) + (diffDays(c.start, date) / diffDays(c.start, c.end)) * c.contentWidth;
export const worldXToDate = (x: number, c: Coordinates) =>
  addDays(
    c.start,
    Math.round(((x - (c.margin ?? MARGIN)) / c.contentWidth) * diffDays(c.start, c.end)),
  );
export const worldToViewport = (world: number, scroll: number) => world - scroll;
export const viewportToWorld = (viewport: number, scroll: number) => viewport + scroll;
export const clampZoom = (zoom: number) => Math.max(1, Math.min(5, Math.round(zoom * 100) / 100));
export function anchoredScroll(
  oldWidth: number,
  newWidth: number,
  scroll: number,
  anchor: number,
  viewport: number,
  margin = MARGIN,
  newMargin = margin,
  totalWidth = newWidth + 2 * newMargin,
): number {
  const next = newMargin + ((scroll + anchor - margin) / oldWidth) * newWidth - anchor;
  return Math.max(0, Math.min(totalWidth - viewport, next));
}
