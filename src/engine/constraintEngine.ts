import type { Link, Project } from '../domain/types';
import { addDays, dayNumber } from './dateEngine';
export function topologicalOrder(ids: string[], links: Link[]): string[] {
  const indegree = new Map(ids.map((id) => [id, 0]));
  const edges = new Map(ids.map((id) => [id, [] as string[]]));
  const pairs = new Set<string>();
  for (const l of links.filter((l) => l.enabled)) {
    if (!indegree.has(l.fromId) || !indegree.has(l.toId)) throw new Error('关联包含不存在的事件');
    if (l.fromId === l.toId) throw new Error('事件不能依赖自身');
    if (!Number.isInteger(l.minGapDays) || l.minGapDays < 0 || l.minGapDays > 36500)
      throw new Error('最小间隔须为 0～36500 的整数');
    const key = `${l.fromId}:${l.toId}`;
    if (pairs.has(key)) throw new Error('已存在相同的有效关联');
    pairs.add(key);
    indegree.set(l.toId, indegree.get(l.toId)! + 1);
    edges.get(l.fromId)!.push(l.toId);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const result: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    result.push(id);
    for (const next of edges.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (!indegree.get(next)) queue.push(next);
    }
  }
  if (result.length !== ids.length) throw new Error('关联会形成循环，请先移除冲突关联');
  return result;
}
export function validateConstraints(project: Project): void {
  topologicalOrder(
    project.milestones.map((m) => m.id),
    project.links,
  );
  const nodes = new Map(project.milestones.map((m) => [m.id, m]));
  for (const l of project.links.filter((l) => l.enabled)) {
    if (dayNumber(nodes.get(l.toId)!.date) < dayNumber(nodes.get(l.fromId)!.date) + l.minGapDays)
      throw new Error(`“${nodes.get(l.toId)!.title}”不满足前置事件的最小间隔`);
  }
}
function bounds(p: Project): void {
  for (const m of p.milestones)
    if (m.date < p.startDate || m.date > p.endDate)
      throw new Error(`“${m.title}”将超出项目日期范围，请先在项目设置中扩展范围`);
}
export function changeDate(project: Project, id: string, date: string): Project {
  dayNumber(date);
  const p = structuredClone(project);
  const node = p.milestones.find((m) => m.id === id);
  if (!node) throw new Error('事件不存在');
  if (node.locked) throw new Error(`“${node.title}”已锁定编辑`);
  const future = date >= node.date;
  node.date = date;
  const order = topologicalOrder(
    p.milestones.map((m) => m.id),
    p.links,
  );
  const nodes = new Map(p.milestones.map((m) => [m.id, m]));
  const affected = new Set([id]);
  for (const key of future ? order : [...order].reverse()) {
    if (!affected.has(key)) continue;
    for (const l of p.links.filter(
      (l) => l.enabled && (future ? l.fromId === key : l.toId === key),
    )) {
      const current = nodes.get(key)!;
      const other = nodes.get(future ? l.toId : l.fromId)!;
      const limit = addDays(current.date, future ? l.minGapDays : -l.minGapDays);
      if (future ? other.date < limit : other.date > limit) {
        if (other.locked) throw new Error(`日期调整与已锁定的“${other.title}”冲突，操作已取消`);
        other.date = limit;
        affected.add(other.id);
      }
    }
  }
  bounds(p);
  validateConstraints(p);
  return p;
}
export function reconcileLinks(project: Project, links: Link[]): Project {
  const p = structuredClone(project);
  p.links = links;
  const order = topologicalOrder(
    p.milestones.map((m) => m.id),
    links,
  );
  const nodes = new Map(p.milestones.map((m) => [m.id, m]));
  for (const id of order) {
    const m = nodes.get(id)!;
    for (const link of links.filter((l) => l.enabled && l.toId === id)) {
      const earliest = addDays(nodes.get(link.fromId)!.date, link.minGapDays);
      if (m.date < earliest) {
        if (m.locked) throw new Error(`关联调整与已锁定的“${m.title}”冲突`);
        m.date = earliest;
      }
    }
  }
  bounds(p);
  validateConstraints(p);
  return p;
}
