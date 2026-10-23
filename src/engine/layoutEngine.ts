import type { Milestone, NodeGeometry, Project, Rect, Scene } from '../domain/types';
import { dateToWorldX, MARGIN } from './coordinateEngine';
import { computeOptimalBoxSize, type Measure } from './textEngine';
import { routeArrow, segmentIntersects } from './routingEngine';
export const overlaps = (a: Rect, b: Rect, gap = 14) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;
export function layoutProject(project: Project, contentWidth: number, measure?: Measure): Scene {
  const placed: NodeGeometry[] = [];
  const warnings: string[] = [];
  const rank = (m: Milestone) => (m.locked || m.layoutLocked ? 0 : m.layout === 'manual' ? 1 : 2);
  const sorted = [...project.milestones].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.level - b.level ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
  for (const m of sorted) {
    const size = computeOptimalBoxSize(m, measure);
    const anchorX = dateToWorldX(m.date, {
      start: project.startDate,
      end: project.endDate,
      contentWidth,
    });
    const x = anchorX - size.width / 2 + m.offsetX;
    const y = m.side === 'above' ? -m.offsetY - size.height : m.offsetY;
    let box = { x, y, width: size.width, height: size.height };
    if (rank(m) === 2) {
      const sign = m.side === 'above' ? -1 : 1;
      // Sweep bounded vertical lanes. No mutation of user offsets and no random search.
      for (let lane = 0; lane <= project.milestones.length + 1; lane++) {
        const candidate = { ...box, y: y + sign * lane * (size.height + 22) };
        if (!placed.some((p) => overlaps(candidate, p))) {
          box = candidate;
          break;
        }
      }
    }
    if (placed.some((p) => overlaps(box, p, 0)))
      warnings.push(`“${m.title}”的位置与其他框体重叠（手动或锁定位置已保留）`);
    placed.push({ ...box, id: m.id, anchorX, points: [], lines: size.lines });
  }
  const minY = Math.min(-220, ...placed.map((p) => p.y));
  const minX = Math.min(0, ...placed.map((p) => p.x - 30));
  // Horizontal overscan is included in the same scene transform as every date anchor.
  const shiftX = -minX;
  const axisY = -minY + 70;
  for (const node of placed) {
    node.x += shiftX;
    node.y += axisY;
    node.anchorX += shiftX;
  }
  const nodes = new Map(project.milestones.map((m) => [m.id, m]));
  for (const node of placed) {
    const obstacles = placed.filter((p) => p.id !== node.id);
    node.points = routeArrow(
      node,
      { x: node.anchorX, y: axisY },
      obstacles,
      nodes.get(node.id)!.arrowType === 'straight',
    );
    if (
      node.points
        .slice(1)
        .some((p, i) => obstacles.some((r) => segmentIntersects(node.points[i], p, r)))
    )
      warnings.push(`“${nodes.get(node.id)!.title}”的连接线穿过框体，可手动调整位置`);
  }
  return {
    nodes: placed,
    axisY,
    margin: MARGIN + shiftX,
    contentWidth,
    width: Math.max(contentWidth + 2 * MARGIN + shiftX, ...placed.map((p) => p.x + p.width + 60)),
    height: Math.max(620, axisY + 220, ...placed.map((p) => p.y + p.height + 70)),
    warnings,
  };
}
