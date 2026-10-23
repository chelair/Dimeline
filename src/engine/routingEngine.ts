import type { Point, Rect } from '../domain/types';
export function segmentIntersects(a: Point, b: Point, r: Rect, pad = 4): boolean {
  if (a.x === b.x)
    return (
      a.x > r.x - pad &&
      a.x < r.x + r.width + pad &&
      Math.max(a.y, b.y) > r.y - pad &&
      Math.min(a.y, b.y) < r.y + r.height + pad
    );
  return (
    a.y > r.y - pad &&
    a.y < r.y + r.height + pad &&
    Math.max(a.x, b.x) > r.x - pad &&
    Math.min(a.x, b.x) < r.x + r.width + pad
  );
}
export function routeArrow(box: Rect, anchor: Point, obstacles: Rect[], straight = false): Point[] {
  const above = box.y + box.height / 2 < anchor.y;
  const port = { x: box.x + box.width / 2, y: above ? box.y + box.height : box.y };
  const candidates: Point[][] = [];
  if (Math.abs(port.x - anchor.x) < 1) candidates.push([port, anchor]);
  for (const fraction of [0.5, 0.25, 0.75, 0.9]) {
    const y = port.y + (anchor.y - port.y) * fraction;
    candidates.push([port, { x: port.x, y }, { x: anchor.x, y }, anchor]);
  }
  if (straight) candidates.unshift([port, { x: anchor.x, y: port.y }, anchor]);
  // A finite set of corridors gives reproducible routes and a readable fallback in dense scenes.
  for (const edge of [box.x - 18, box.x + box.width + 18]) {
    const start = { x: edge < box.x ? box.x : box.x + box.width, y: box.y + box.height / 2 };
    candidates.push([
      start,
      { x: edge, y: start.y },
      { x: edge, y: anchor.y + (above ? -22 : 22) },
      { x: anchor.x, y: anchor.y + (above ? -22 : 22) },
      anchor,
    ]);
  }
  const score = (points: Point[]) =>
    points
      .slice(1)
      .reduce(
        (s, b, i) =>
          s +
          Math.abs(b.x - points[i].x) +
          Math.abs(b.y - points[i].y) +
          obstacles.filter((r) => segmentIntersects(points[i], b, r)).length * 100000,
        points.length * 4,
      );
  return candidates.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => a.s - b.s || a.i - b.i)[0]
    .p;
}
export const pathData = (points: Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
