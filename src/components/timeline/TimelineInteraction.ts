import type { Project, Scene } from '../../domain/types';
import { worldXToDate } from '../../engine/coordinateEngine';
import { changeDate } from '../../engine/constraintEngine';
export interface DragContext {
  id: string;
  mode: 'date' | 'box';
  pointerId: number;
  startX: number;
  startY: number;
  project: Project;
  scene: Scene;
  moved: boolean;
}
export function dragPreview(drag: DragContext, dx: number, dy: number): Project {
  const node = drag.scene.nodes.find((n) => n.id === drag.id)!;
  if (drag.mode === 'date') {
    const date = worldXToDate(node.anchorX + dx, {
      start: drag.project.startDate,
      end: drag.project.endDate,
      contentWidth: drag.scene.contentWidth,
      margin: drag.scene.margin,
    });
    return changeDate(drag.project, drag.id, date);
  }
  const m = drag.project.milestones.find((m) => m.id === drag.id)!;
  const relativeY = node.y + dy - drag.scene.axisY;
  const side = relativeY + node.height / 2 < 0 ? 'above' : 'below';
  const patch = {
    side,
    offsetX: m.offsetX + dx,
    offsetY: Math.max(0, side === 'above' ? -relativeY - node.height : relativeY),
    layout: 'manual',
  } as const;
  return {
    ...drag.project,
    milestones: drag.project.milestones.map((m) => (m.id === drag.id ? { ...m, ...patch } : m)),
  };
}
