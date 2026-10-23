import { createMilestone, createProject } from '../src/domain/defaults';
import type { Link, Project } from '../src/domain/types';
export function fixture(dates = ['2026-01-10', '2026-01-15', '2026-01-20']): Project {
  return {
    ...createProject(),
    id: 'project',
    title: '测试项目',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    milestones: dates.map((date, i) => ({
      ...createMilestone(date),
      id: String.fromCharCode(65 + i),
      title: String.fromCharCode(65 + i),
    })),
    links: [],
  };
}
export const link = (fromId: string, toId: string, minGapDays = 0, enabled = true): Link => ({
  id: fromId + toId,
  fromId,
  toId,
  minGapDays,
  enabled,
});
