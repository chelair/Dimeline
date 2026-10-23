import { describe, it, expect } from 'vitest';
import { layoutProject, overlaps } from '../src/engine/layoutEngine';
import { computeOptimalBoxSize } from '../src/engine/textEngine';
import { renderExportSvg } from '../src/services/exportService';
import { fixture } from './helpers';
describe('确定性布局与正交路由', () => {
  it('同日节点自动避让，结果可复现、不改写项目', () => {
    const p = fixture(Array(20).fill('2026-05-01'));
    const before = JSON.stringify(p);
    const scene = layoutProject(p, 1200);
    expect(scene).toEqual(layoutProject(p, 1200));
    expect(JSON.stringify(p)).toBe(before);
    for (const a of scene.nodes)
      for (const b of scene.nodes) if (a.id !== b.id) expect(overlaps(a, b, 0)).toBe(false);
  });
  it('锁定与手动位置保留', () => {
    const p = fixture();
    p.milestones[0] = { ...p.milestones[0], layoutLocked: true, offsetX: 47, offsetY: 133 };
    const a = layoutProject(p, 1200);
    p.milestones.push({ ...p.milestones[1], id: 'D' });
    const b = layoutProject(p, 1200);
    const n = a.nodes.find((n) => n.id === 'A')!;
    const m = b.nodes.find((n) => n.id === 'A')!;
    expect(m.x - m.anchorX).toBe(n.x - n.anchorX);
    expect(m.y - b.axisY).toBe(n.y - a.axisY);
  });
  it('每条箭头精确落在日期锚点，线段均为正交', () => {
    const p = fixture();
    p.milestones[0].offsetX = 80;
    p.milestones[1].side = 'below';
    const scene = layoutProject(p, 1200);
    for (const n of scene.nodes) {
      expect(n.points.at(-1)).toEqual({ x: n.anchorX, y: scene.axisY });
      for (let i = 1; i < n.points.length; i++)
        expect(n.points[i - 1].x === n.points[i].x || n.points[i - 1].y === n.points[i].y).toBe(
          true,
        );
    }
  });
  it.each([100, 200])('%i 个密集节点可终止，记录计算耗时', (count) => {
    const p = fixture(Array(count).fill('2026-05-01'));
    const start = performance.now();
    const scene = layoutProject(p, 1800);
    const elapsed = performance.now() - start;
    expect(scene.nodes).toHaveLength(count);
    expect(elapsed).toBeLessThan(5000);
    console.info(`布局 ${count} 节点：${elapsed.toFixed(1)} ms`);
  });
  it('中文多行尺寸与手动尺寸', () => {
    const m = fixture().milestones[0];
    m.title = '中文多行\n项目验收与交付';
    expect(computeOptimalBoxSize(m).lines.length).toBeGreaterThanOrEqual(2);
    m.autoSize = false;
    m.width = 90;
    m.height = 55;
    expect(computeOptimalBoxSize(m)).toMatchObject({ width: 90, height: 55 });
  });
  it('独立 SVG 导出包含中文转义和全部节点，不使用 foreignObject', () => {
    const p = fixture();
    p.milestones[0].title = '中文 & <验收>\n第二行';
    const scene = layoutProject(p, 1200);
    const svg = renderExportSvg(p, scene);
    expect(svg).toContain('中文 &amp; &lt;验收&gt;');
    expect(svg).toContain('第二行');
    expect(svg).not.toContain('foreignObject');
    expect(svg).toContain(`height="${scene.height}"`);
  });
});
