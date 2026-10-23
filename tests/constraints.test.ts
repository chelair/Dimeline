import { describe, it, expect } from 'vitest';
import {
  changeDate,
  reconcileLinks,
  topologicalOrder,
  validateConstraints,
} from '../src/engine/constraintEngine';
import { fixture, link } from './helpers';
describe('DAG 日期约束', () => {
  it('A → B → C 向未来传播，输入保持不变', () => {
    const p = fixture();
    p.links = [link('A', 'B', 5), link('B', 'C', 5)];
    const next = changeDate(p, 'A', '2026-01-17');
    expect(next.milestones.map((m) => m.date)).toEqual(['2026-01-17', '2026-01-22', '2026-01-27']);
    expect(p.milestones[0].date).toBe('2026-01-10');
  });
  it('向过去推动必要前驱，不无故改动后继', () => {
    const p = fixture(['2026-01-10', '2026-01-15', '2026-01-20', '2026-02-01']);
    p.links = [link('A', 'B', 5), link('B', 'C', 5), link('C', 'D', 3)];
    expect(changeDate(p, 'C', '2026-01-17').milestones.map((m) => m.date)).toEqual([
      '2026-01-07',
      '2026-01-12',
      '2026-01-17',
      '2026-02-01',
    ]);
  });
  it('多前驱、多后继和汇合路径的最大日期约束', () => {
    const p = fixture(['2026-01-10', '2026-01-10', '2026-01-20', '2026-01-30']);
    p.links = [link('A', 'B', 0), link('A', 'C', 5), link('B', 'D', 12), link('C', 'D', 3)];
    const next = changeDate(p, 'A', '2026-02-01');
    expect(next.milestones.map((m) => m.date)).toEqual([
      '2026-02-01',
      '2026-02-01',
      '2026-02-06',
      '2026-02-13',
    ]);
    validateConstraints(next);
  });
  it('提前不影响不必要节点，禁用和移除的关联不传播', () => {
    const p = fixture();
    p.links = [link('A', 'B', 5, false)];
    expect(changeDate(p, 'A', '2026-03-01').milestones[1].date).toBe('2026-01-15');
    p.links = [];
    expect(changeDate(p, 'A', '2026-02-01').milestones[1].date).toBe('2026-01-15');
  });
  it('拒绝自引用、重复、循环与悬空关系', () => {
    for (const links of [
      [link('A', 'A')],
      [link('A', 'B'), { ...link('A', 'B'), id: 'copy' }],
      [link('A', 'B'), link('B', 'A')],
      [link('A', 'X')],
    ])
      expect(() => topologicalOrder(['A', 'B'], links)).toThrow();
  });
  it('锁定冲突或范围冲突全部回滚，布局锁不阻止日期传播', () => {
    const p = fixture();
    p.links = [link('A', 'B', 5), link('B', 'C', 5)];
    p.milestones[2].locked = true;
    const before = JSON.stringify(p);
    expect(() => changeDate(p, 'A', '2026-02-01')).toThrow('锁定');
    expect(JSON.stringify(p)).toBe(before);
    p.milestones[2].locked = false;
    p.milestones[1].layoutLocked = true;
    expect(changeDate(p, 'A', '2026-02-01').milestones[1].date).toBe('2026-02-06');
    expect(() => changeDate(p, 'A', '2026-12-30')).toThrow('日期范围');
  });
  it('新增关联预检查与最小间隔校验', () => {
    const p = fixture();
    const next = reconcileLinks(p, [link('A', 'B', 20), link('B', 'C', 20)]);
    expect(next.milestones[2].date).toBe('2026-02-19');
    expect(p.links).toHaveLength(0);
    expect(() => reconcileLinks(p, [link('A', 'B', -1)])).toThrow();
    expect(() => reconcileLinks(p, [link('A', 'B', 1.5)])).toThrow();
  });
});
