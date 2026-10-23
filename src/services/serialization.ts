import { createMilestone, createProject, uid } from '../domain/defaults';
import type { Link, Milestone, Project } from '../domain/types';
import { dayNumber } from '../engine/dateEngine';
import { reconcileLinks, validateConstraints } from '../engine/constraintEngine';
export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('项目必须是 JSON 对象');
  return value as Record<string, unknown>;
};
const str = (v: unknown, fallback: string, max = 10000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
export function validateProject(p: Project): void {
  if (!p.id || typeof p.title !== 'string') throw new Error('项目缺少标识或名称');
  if (dayNumber(p.endDate) <= dayNumber(p.startDate))
    throw new Error('项目结束日期必须晚于开始日期');
  if (p.milestones.length > 5000 || p.links.length > 20000)
    throw new Error('项目过大（最多 5000 个事件、20000 个关联）');
  const ids = new Set<string>();
  for (const m of p.milestones) {
    dayNumber(m.date);
    if (!m.id || ids.has(m.id)) throw new Error('事件标识重复或缺失');
    ids.add(m.id);
    if (m.date < p.startDate || m.date > p.endDate) throw new Error(`“${m.title}”超出项目日期范围`);
    if (!m.title.trim()) throw new Error('事件标题不能为空');
  }
  const linkIds = new Set<string>();
  for (const l of p.links) {
    if (!l.id || linkIds.has(l.id) || !ids.has(l.fromId) || !ids.has(l.toId) || l.fromId === l.toId)
      throw new Error('关联标识或端点无效');
    linkIds.add(l.id);
    if (!Number.isInteger(l.minGapDays) || l.minGapDays < 0 || l.minGapDays > 36500)
      throw new Error('关联间隔无效');
  }
  validateConstraints(p);
}
export function deserialize(text: string): { project: Project; warnings: string[] } {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error('文件超过 10 MB 限制');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效 JSON，请检查文件是否损坏');
  }
  const root = record(parsed);
  const version = root.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION)
    throw new Error(`文件格式版本 ${version} 高于当前支持版本，请升级应用`);
  const raw = record(root.project ?? root.Project ?? root);
  const warnings: string[] = [];
  const base = createProject();
  const startDate = str(raw.startDate, base.startDate);
  const endDate = str(raw.endDate, base.endDate);
  dayNumber(startDate);
  dayNumber(endDate);
  if (endDate <= startDate) throw new Error('项目日期范围无效');
  if (!Array.isArray(raw.milestones)) throw new Error('文件缺少 milestones 事件列表');
  if (raw.milestones.length > 5000) throw new Error('事件数量超过 5000');
  const line = raw.mainLine && typeof raw.mainLine === 'object' ? record(raw.mainLine) : {};
  let p: Project = {
    id: str(raw.id, uid(), 100),
    title: str(raw.title ?? raw.name, '未命名项目', 200),
    startDate,
    endDate,
    mainLine: { color: color(line.color, '#C7000B'), width: num(line.width, 3, 1, 10) },
    milestones: [],
    links: [],
  };
  const ids = new Set<string>();
  const oldNodes: Record<string, unknown>[] = [];
  for (let i = 0; i < raw.milestones.length; i++) {
    const r = record(raw.milestones[i]);
    const date = str(r.date, '');
    try {
      dayNumber(date);
    } catch {
      throw new Error(`第 ${i + 1} 个事件日期无效，未加载文件；当前项目已保留`);
    }
    const level = Math.round(
      num(typeof r.level === 'string' ? Number(r.level.replace('L', '')) : r.level, 2, 1, 4),
    ) as Milestone['level'];
    const d = createMilestone(date, level);
    const id = str(r.id, d.id, 100);
    if (ids.has(id)) throw new Error(`事件 ID 重复：${id}，请先修复源文件`);
    ids.add(id);
    const m: Milestone = {
      ...d,
      id,
      title: str(r.title ?? r.description, '未命名事件').trim() || '未命名事件',
      level,
      side:
        r.side === 'below' || r.position === 'bottom' || r.position === 'below' ? 'below' : 'above',
      completed: bool(r.completed ?? r.isCompleted, false),
      locked: bool(r.locked ?? r.isLocked, false),
      layoutLocked: bool(r.layoutLocked ?? r.isLayoutLocked, false),
      fontFamily: str(r.fontFamily, d.fontFamily, 100),
      bold: bool(r.bold, r.fontWeight === 'bold' || r.fontWeight === 700),
      fontSize: num(r.fontSize ?? r.descriptionFontSize, d.fontSize, 8, 48),
      dateFontSize: num(r.dateFontSize, d.dateFontSize, 8, 36),
      textColor: color(r.textColor, d.textColor),
      arrowColor: color(r.arrowColor, d.arrowColor),
      arrowWidth: num(r.arrowWidth, d.arrowWidth, 1, 6),
      arrowType: r.arrowType === 'straight' ? 'straight' : 'elbow',
      width: num(r.width ?? r.boxWidth, d.width, 64, 1200),
      height: num(r.height ?? r.boxHeight, d.height, 32, 1200),
      autoSize: bool(r.autoSize, true),
      fillEnabled: bool(r.fillEnabled ?? r.boxFillEnabled, true),
      fillColor: color(r.fillColor ?? r.boxFillColor, d.fillColor),
      borderStyle: ['solid', 'dashed', 'none'].includes(String(r.borderStyle))
        ? (r.borderStyle as Milestone['borderStyle'])
        : 'solid',
      borderColor: color(r.borderColor, d.borderColor),
      borderWidth: num(r.borderWidth, 1, 0, 8),
      offsetX: num(r.offsetX ?? r.manualOffsetX, 0, -10000, 10000),
      offsetY: Math.abs(num(r.offsetY ?? r.manualOffsetY, 72, -10000, 10000)),
      layout:
        r.layout === 'manual' || r.manualOffsetX !== undefined || r.manualOffsetY !== undefined
          ? 'manual'
          : 'auto',
    };
    if (r.bendPoint !== undefined)
      warnings.push(`“${m.title}”的旧折点已转为自动正交路由，手动框体偏移已保留`);
    if (date < p.startDate) {
      p.startDate = date;
      warnings.push('已扩展开始日期以保留范围外事件');
    }
    if (date > p.endDate) {
      p.endDate = date;
      warnings.push('已扩展结束日期以保留范围外事件');
    }
    p.milestones.push(m);
    oldNodes.push(r);
  }
  const candidates: Link[] = [];
  if (raw.links !== undefined && !Array.isArray(raw.links)) throw new Error('links 必须是数组');
  const rawLinks = (raw.links ?? []) as unknown[];
  if (rawLinks.length > 20000) throw new Error('关联数量超过 20000');
  for (const item of rawLinks) {
    const l = record(item);
    const fromId = str(l.fromId ?? l.sourceId, '', 100);
    const toId = str(l.toId ?? l.targetId, '', 100);
    candidates.push({
      id: str(l.id, uid(), 100),
      fromId,
      toId,
      minGapDays: Math.round(num(l.minGapDays, 0, 0, 36500)),
      enabled: bool(l.enabled, true),
    });
  }
  for (let i = 0; i < oldNodes.length; i++) {
    const predecessors = oldNodes[i].predecessors;
    if (Array.isArray(predecessors))
      for (const old of predecessors) {
        const fromId =
          typeof old === 'string' ? old : str(record(old).id ?? record(old).fromId, '');
        const toId = p.milestones[i].id;
        if (!candidates.some((l) => l.fromId === fromId && l.toId === toId))
          candidates.push({ id: uid(), fromId, toId, minGapDays: 0, enabled: true });
      }
  }
  const linkIds = new Set<string>();
  for (const l of candidates) {
    if (!ids.has(l.fromId) || !ids.has(l.toId) || l.fromId === l.toId) {
      warnings.push(`已忽略无效关联 ${l.fromId} → ${l.toId}`);
      continue;
    }
    if (p.links.some((e) => e.fromId === l.fromId && e.toId === l.toId && e.enabled && l.enabled)) {
      warnings.push('已合并重复关联，保留首个显式间隔');
      continue;
    }
    if (linkIds.has(l.id)) l.id = uid();
    try {
      const next = reconcileLinks(p, [...p.links, l]);
      if (next.milestones.some((m, i) => m.date !== p.milestones[i].date))
        warnings.push('已将旧项目中的后继日期调整到符合依赖约束的日期');
      p = next;
      linkIds.add(l.id);
    } catch (error) {
      warnings.push(`已忽略关联 ${l.fromId} → ${l.toId}：${(error as Error).message}`);
    }
  }
  validateProject(p);
  return { project: p, warnings: [...new Set(warnings)] };
}
export const fingerprint = (p: Project) => JSON.stringify(p);
export function serialize(p: Project): string {
  validateProject(p);
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      project: p,
      metadata: { application: 'Dimeline', appVersion: '1.0.0' },
    },
    null,
    2,
  );
}
