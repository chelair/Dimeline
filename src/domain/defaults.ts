import type { Level, Milestone, Project } from './types';
import { addDays, today } from '../engine/dateEngine';
export const uid = () => crypto.randomUUID();
export const presets = {
  1: {
    fontSize: 16,
    dateFontSize: 12,
    width: 180,
    height: 62,
    arrowWidth: 2.5,
    textColor: '#263c36',
    borderColor: '#73988b',
    fillColor: '#edf4f0',
    arrowColor: '#638878',
  },
  2: {
    fontSize: 14,
    dateFontSize: 11,
    width: 156,
    height: 52,
    arrowWidth: 2,
    textColor: '#344659',
    borderColor: '#9aafc2',
    fillColor: '#edf2f7',
    arrowColor: '#849db3',
  },
  3: {
    fontSize: 13,
    dateFontSize: 11,
    width: 136,
    height: 46,
    arrowWidth: 1.5,
    textColor: '#655579',
    borderColor: '#b7a6c6',
    fillColor: '#f3eff8',
    arrowColor: '#ac99bd',
  },
  4: {
    fontSize: 12,
    dateFontSize: 10,
    width: 112,
    height: 40,
    arrowWidth: 1,
    textColor: '#6f6352',
    borderColor: '#c6b79e',
    fillColor: '#f8f3e9',
    arrowColor: '#b4a588',
  },
} satisfies Record<Level, Partial<Milestone>>;
export function createMilestone(date: string, level: Level = 2): Milestone {
  return {
    id: uid(),
    title: '新建事件',
    date,
    level,
    side: 'above',
    completed: false,
    locked: false,
    layoutLocked: false,
    fontFamily: 'Microsoft YaHei',
    bold: false,
    arrowType: 'elbow',
    autoSize: true,
    fillEnabled: true,
    borderStyle: 'solid',
    borderWidth: 1,
    offsetX: 0,
    offsetY: 72,
    layout: 'auto',
    ...presets[level],
  };
}
export function createProject(): Project {
  const startDate = today();
  return {
    id: uid(),
    title: '未命名项目',
    startDate,
    endDate: addDays(startDate, 180),
    mainLine: { color: '#C7000B', width: 3 },
    milestones: [],
    links: [],
  };
}
