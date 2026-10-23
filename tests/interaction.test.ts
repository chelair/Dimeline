import { describe, it, expect } from 'vitest';
import { layoutProject } from '../src/engine/layoutEngine';
import { dragPreview, type DragContext } from '../src/components/timeline/TimelineInteraction';
import { fixture } from './helpers';
describe('拖拽几何', () => {
  function context(mode: 'date' | 'box'): DragContext {
    const project = fixture();
    return {
      project,
      scene: layoutProject(project, 1200),
      id: 'A',
      mode,
      pointerId: 1,
      startX: 0,
      startY: 0,
      moved: false,
    };
  }
  it('鼠标起始偏移不改变日期，平移按同一日期比例取整', () => {
    const drag = context('date');
    expect(dragPreview(drag, 0, 0).milestones[0].date).toBe('2026-01-10');
    expect(dragPreview(drag, (1200 / 364) * 2, 100).milestones[0].date).toBe('2026-01-12');
  });
  it('文本框跨越主线自动换边，保持日期和其他事件不变', () => {
    const drag = context('box');
    const n = drag.scene.nodes.find((n) => n.id === 'A')!;
    const next = dragPreview(drag, 43, drag.scene.axisY - n.y + 55);
    expect(next.milestones[0]).toMatchObject({
      side: 'below',
      layout: 'manual',
      offsetX: 43,
      offsetY: 55,
      date: '2026-01-10',
    });
    expect(next.milestones.slice(1)).toEqual(drag.project.milestones.slice(1));
  });
});
