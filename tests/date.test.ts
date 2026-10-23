import { describe, it, expect } from 'vitest';
import { addDays, dayNumber, diffDays, generateTicks } from '../src/engine/dateEngine';
import {
  anchoredScroll,
  dateToWorldX,
  viewportToWorld,
  worldToViewport,
  worldXToDate,
} from '../src/engine/coordinateEngine';
describe('date-only 日历计算', () => {
  it('同日、跨月、跨年与闰年', () => {
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(diffDays('2026-01-31', '2026-02-01')).toBe(1);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-03-07', '2026-03-10')).toBe(3);
    expect(addDays('0099-12-31', 1)).toBe('0100-01-01');
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-10', '2026-1-01', 'oops', '0000-01-01'])(
    '拒绝无效日期 %s',
    (date) => expect(() => dayNumber(date)).toThrow(),
  );
  it('日期上限生成刻度仍可正常终止', () => {
    expect(generateTicks('9999-12-01', '9999-12-31', 1000).at(-1)?.date).toBe('9999-12-31');
    expect(
      generateTicks('0099-12-01', '0100-02-01', 1000).some((t) => t.date === '0100-01-01'),
    ).toBe(true);
  });
  it('月刻度含首尾并避免重叠', () => {
    const ticks = generateTicks('2026-01-12', '2026-05-22', 1200);
    expect(ticks[0].date).toBe('2026-01-12');
    expect(ticks.at(-1)?.date).toBe('2026-05-22');
    expect(ticks.some((t) => t.date === '2026-03-01')).toBe(true);
  });
});
describe('世界 / 视口坐标', () => {
  const c = { start: '2026-01-01', end: '2026-12-31', contentWidth: 1379 };
  it('所有日期双向转换无一天误差，滚动仅计算一次', () => {
    for (let i = 0; i < 365; i++) {
      const date = addDays(c.start, i);
      const world = dateToWorldX(date, c);
      expect(worldXToDate(world, c)).toBe(date);
      expect(worldXToDate(viewportToWorld(worldToViewport(world, 473), 473), c)).toBe(date);
    }
  });
  it('滚动后缩放保留鼠标所在日期的亚像素位置', () => {
    let scroll = 330;
    let width = 1200;
    const anchor = 287;
    const ratio = (scroll + anchor - 110) / width;
    for (let i = 0; i < 30; i++)
      for (const next of [2400, 1800, 1200]) {
        scroll = anchoredScroll(width, next, scroll, anchor, 900);
        width = next;
        expect((scroll + anchor - 110) / width).toBeCloseTo(ratio, 12);
      }
  });
  it('边界缩放限制滚动合法范围', () => {
    expect(anchoredScroll(1200, 650, 0, 30, 870)).toBe(0);
    expect(anchoredScroll(1200, 2400, 1500, 890, 900)).toBeLessThanOrEqual(1720);
  });
  it('手动布局留白变化时保留日期比例', () => {
    const next = anchoredScroll(1200, 2400, 400, 250, 900, 180, 130, 2700);
    expect((next + 250 - 130) / 2400).toBeCloseTo((400 + 250 - 180) / 1200, 12);
  });
});
