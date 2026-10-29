import type { Project, Milestone } from '../domain/types';
import { createMilestone, uid } from '../domain/defaults';
import {
  emptyWorkspace,
  newWork,
  taskKinds,
  taskStatuses,
  type WorkCommand,
  type WorkProposal,
  type WorkSnapshot,
  type WorkTask,
  type WorkAudit,
} from '../domain/work';
import { dayNumber, today, addDays } from './dateEngine';

export const workspace = (p: Project) => p.workspace ?? emptyWorkspace();
export const workNodes = (p: Project) =>
  p.milestones.filter((n): n is Milestone & { work: WorkTask } => !!n.work);
export function snapshot(p: Project): WorkSnapshot {
  const w = workspace(p);
  return structuredClone({
    nodes: workNodes(p).map(({ id, title, date, completed, work }) => ({
      id,
      title,
      date,
      completed,
      work,
    })),
    lines: w.lines,
    dependencies: w.dependencies,
    issues: w.issues,
    memories: w.memories,
    unresolved: w.unresolved,
  });
}
export const workRevision = (p: Project) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(snapshot(p)).map(([key, items]) => [
        key,
        [...items].sort((a, b) => a.id.localeCompare(b.id)),
      ]),
    ),
  );
export function auditRevision(p: Project): string {
  const text = workRevision(p);
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
function changed<T extends { id: string }>(before: T[], after: T[]): [T[], T[]] {
  const a = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const b = new Map(after.map((item) => [item.id, JSON.stringify(item)]));
  return [
    before.filter((item) => a.get(item.id) !== b.get(item.id)),
    after.filter((item) => a.get(item.id) !== b.get(item.id)),
  ];
}
function auditDelta(before: Project, after: Project) {
  const a = snapshot(before);
  const b = snapshot(after);
  // Undoing adoption restores the existing timeline event instead of deleting it.
  const touchedIds = new Set([...a.nodes, ...b.nodes].map((n) => n.id));
  for (const [project, data] of [
    [before, a],
    [after, b],
  ] as const)
    for (const n of project.milestones) {
      if (!n.work && touchedIds.has(n.id))
        data.nodes.push({ id: n.id, title: n.title, date: n.date, completed: n.completed });
    }
  const nodes = changed(a.nodes, b.nodes),
    lines = changed(a.lines, b.lines),
    dependencies = changed(a.dependencies, b.dependencies),
    issues = changed(a.issues, b.issues),
    memories = changed(a.memories, b.memories),
    unresolved = changed(a.unresolved, b.unresolved);
  return {
    before: {
      nodes: nodes[0],
      lines: lines[0],
      dependencies: dependencies[0],
      issues: issues[0],
      memories: memories[0],
      unresolved: unresolved[0],
    },
    after: {
      nodes: nodes[1],
      lines: lines[1],
      dependencies: dependencies[1],
      issues: issues[1],
      memories: memories[1],
      unresolved: unresolved[1],
    },
    beforeRevision: auditRevision(before),
    afterRevision: auditRevision(after),
  };
}
export function topologicalWork(p: Project): string[] {
  const ids = workNodes(p).map((n) => n.id);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of workspace(p).dependencies) {
    if (!indegree.has(e.from) || !indegree.has(e.to)) throw new Error('任务依赖的节点不存在');
    outgoing.get(e.from)!.push(e.to);
    indegree.set(e.to, indegree.get(e.to)! + 1);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  for (let i = 0; i < queue.length; i++)
    for (const id of outgoing.get(queue[i])!) {
      indegree.set(id, indegree.get(id)! - 1);
      if (!indegree.get(id)) queue.push(id);
    }
  if (queue.length !== ids.length) throw new Error('任务依赖不能形成循环；返工请新增轮次');
  return queue;
}
export function blockers(p: Project, id: string): string[] {
  const nodes = new Map(p.milestones.map((n) => [n.id, n]));
  const result = workspace(p)
    .dependencies.filter((e) => e.to === id && e.hard)
    .flatMap((e) => {
      const n = nodes.get(e.from);
      const met =
        n?.work &&
        (e.condition === 'done' ? n.work.status === 'done' : n.work.condition === e.condition);
      return met
        ? []
        : [
            `${n?.title ?? '前置任务'}：${e.condition === 'done' ? '尚未完成' : `等待${{ passed: '通过', confirmed: '确认', ready: '齐套' }[e.condition]}`}`,
          ];
    });
  for (const issue of workspace(p).issues)
    if (issue.status === 'open' && issue.affectedIds.includes(id))
      result.push(`NG未闭环：${issue.title}`);
  return result;
}
export function validateWork(p: Project): void {
  if (!p.workspace && !p.milestones.some((n) => n.work)) return;
  const w = workspace(p);
  if (![w.lines, w.dependencies, w.issues, w.memories, w.unresolved, w.audits].every(Array.isArray))
    throw new Error('任务工作空间格式不完整');
  const nodes = workNodes(p);
  const ids = new Set(nodes.map((n) => n.id));
  const lineIds = new Set(w.lines.map((l) => l.id));
  if (lineIds.size !== w.lines.length) throw new Error('任务线标识重复');
  for (const line of w.lines) {
    if (!line.title.trim()) throw new Error('任务线名称不能为空');
    if (line.parentId && !lineIds.has(line.parentId)) throw new Error('父任务线不存在');
    const seen = new Set([line.id]);
    let parent = line.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error('任务线挂接不能形成循环');
      seen.add(parent);
      parent = w.lines.find((l) => l.id === parent)?.parentId ?? '';
    }
    if (line.attachNodeId && !ids.has(line.attachNodeId)) throw new Error('挂接节点不存在');
    if (
      line.finalNodeId &&
      !nodes.some((n) => n.id === line.finalNodeId && n.work.lineId === line.id)
    )
      throw new Error('最终节点必须属于当前任务线');
  }
  for (const n of nodes) {
    const t = n.work;
    if (t.lineId && !lineIds.has(t.lineId)) throw new Error('所属任务线不存在');
    if (!(t.kind in taskKinds) || !(t.status in taskStatuses))
      throw new Error('任务类型或状态无效');
    if (t.progress !== null && (!Number.isFinite(t.progress) || t.progress < 0 || t.progress > 100))
      throw new Error('进度须为0～100');
    if (t.due) dayNumber(t.due);
    if (t.window) {
      if (!Number.isFinite(new Date(t.window).getTime())) throw new Error('窗口时间无效');
    }
    for (const hours of [t.estimateHours, t.remainingHours])
      if (hours !== null && (!Number.isFinite(hours) || hours < 0))
        throw new Error('工时不能为负数');
    if (n.completed !== (t.status === 'done')) throw new Error('任务完成状态不一致');
    if (t.status === 'done') {
      if (t.progress !== 100) throw new Error('已完成任务的进度应为100%；如需修改请先重开任务');
      const reasons = blockers(p, n.id);
      if (reasons.length) throw new Error(`“${n.title}”不能完成：${reasons.join('；')}`);
      const required = {
        review: 'passed',
        resource: 'confirmed',
        material: 'ready',
        archive: 'archived',
      }[t.kind as string];
      if (required && t.condition !== required)
        throw new Error(`“${n.title}”尚未满足${taskKinds[t.kind]}完成条件`);
      if (t.kind === 'archive' && (!t.artifact.trim() || !t.artifactVersion.trim()))
        throw new Error('归档需要材料路径和版本');
    }
  }
  const pairs = new Set<string>();
  for (const e of w.dependencies) {
    const key = `${e.from}:${e.to}`;
    if (pairs.has(key)) throw new Error('已存在相同任务依赖');
    pairs.add(key);
    if (!['done', 'passed', 'confirmed', 'ready'].includes(e.condition))
      throw new Error('依赖条件无效');
  }
  topologicalWork(p);
  for (const issue of w.issues) {
    if (
      !ids.has(issue.testId) ||
      issue.affectedIds.some((id) => !ids.has(id)) ||
      issue.rounds.some((r) => r.taskIds.some((id) => !ids.has(id)))
    )
      throw new Error('异常关联任务不存在，请先处理异常引用');
    if (
      issue.status === 'closed' &&
      (issue.rounds.at(-1)?.result !== 'passed' ||
        issue.rounds
          .at(-1)
          ?.taskIds.some((id) => nodes.find((n) => n.id === id)?.work.status !== 'done'))
    )
      throw new Error('回归通过且本轮任务全部完成后才能关闭NG');
  }
}
export function commandLevel(commands: WorkCommand[]): WorkProposal['level'] {
  const high = commands.some(
    (c) =>
      c.type === 'removeDependency' ||
      c.type === 'closeIssue' ||
      (c.type === 'update' &&
        (c.patch.kind === 'archive' || ['passed', 'archived'].includes(c.patch.condition ?? ''))),
  );
  if (high || commands.filter((c) => c.type === 'update' && c.patch.due !== undefined).length > 1)
    return 'L3';
  if (
    commands.every(
      (c) =>
        c.type === 'update' &&
        !c.title &&
        Object.keys(c.patch).every((k) =>
          ['progress', 'estimated', 'remaining', 'blocker', 'notes'].includes(k),
        ) &&
        c.patch.progress !== 100,
    )
  )
    return 'L1';
  return 'L2';
}
export function proposal(
  p: Project,
  commands: WorkCommand[],
  rawText: string,
  source: 'manual' | 'assistant' = 'manual',
): WorkProposal {
  commands = [...commands];
  if (!commands.some((c) => c.type === 'memory' && c.memory.tags.includes('延期记录'))) {
    for (const c of [...commands])
      if (c.type === 'update' && c.patch.due) {
        const node = p.milestones.find((n) => n.id === c.id);
        if (node?.work?.due && c.patch.due > node.work.due)
          commands.push({
            type: 'memory',
            memory: {
              id: uid(),
              type: 'lesson',
              content: `${node.title}：截止从${node.work.due}调整至${c.patch.due}。原因及背景：${rawText}。下次类似任务需核对前置及窗口。`,
              tags: `延期记录,${workspace(p).lines.find((l) => l.id === node.work!.lineId)?.title ?? node.title}`,
              source: rawText,
              verified: false,
              createdAt: new Date().toISOString(),
            },
          });
      }
  }
  let level = commandLevel(commands);
  if (
    commands.some(
      (c) =>
        c.type === 'update' &&
        c.patch.progress !== undefined &&
        c.patch.progress !== null &&
        ((p.milestones.find((n) => n.id === c.id)?.work?.progress ?? 0) > c.patch.progress ||
          ['done', 'cancelled'].includes(
            p.milestones.find((n) => n.id === c.id)?.work?.status ?? '',
          )),
    )
  )
    level = 'L2';
  if (
    commands.some(
      (c) =>
        c.type === 'dependency' &&
        p.milestones.some((n) => n.id === c.edge.to) &&
        p.milestones.some((n) => n.id === c.edge.from),
    )
  )
    level = 'L3';
  const labels: Record<string, string> = {
    progress: '进度',
    estimated: '估算标记',
    remaining: '剩余工作',
    blocker: '卡点',
    status: '状态',
    due: '截止',
    priority: '优先级',
    condition: '业务结果',
    window: '窗口',
    artifact: '材料路径',
    artifactVersion: '材料版本',
    notes: '备注',
    lineId: '任务线',
    stage: 'TR阶段',
    kind: '类型',
    baselineDue: '原始截止',
    deadline: '截止性质',
    estimateHours: '预计工时',
    remainingHours: '剩余工时',
    organization: '组织/资源',
    recurringWeekday: '每周窗口',
    quantity: '物料数量',
  };
  const show = (v: unknown) => (v === null || v === '' || v === undefined ? '未填写' : String(v));
  const diff = commands.flatMap((c) => {
    switch (c.type) {
      case 'line':
        return [
          `${workspace(p).lines.some((l) => l.id === c.line.id) ? '调整' : '新建'}任务线：${c.line.title}`,
        ];
      case 'task':
        return [`新建节点：${c.title}（${taskKinds[c.work.kind]}）`];
      case 'update': {
        const n = p.milestones.find((n) => n.id === c.id);
        return [
          ...(c.title && c.title !== n?.title ? [`${n?.title}：标题 → ${c.title}`] : []),
          ...Object.entries(c.patch)
            .filter(
              ([k, v]) => JSON.stringify(n?.work?.[k as keyof WorkTask]) !== JSON.stringify(v),
            )
            .map(
              ([k, v]) =>
                `${n?.title ?? c.id} · ${labels[k] ?? k}：${show(n?.work?.[k as keyof WorkTask])} → ${show(v)}`,
            ),
        ];
      }
      case 'dependency':
        return [
          `新增${c.edge.hard ? '强' : '弱'}依赖：${p.milestones.find((n) => n.id === c.edge.from)?.title ?? '新节点'} → ${p.milestones.find((n) => n.id === c.edge.to)?.title ?? '新节点'}`,
        ];
      case 'removeDependency':
        return ['移除既有任务依赖'];
      case 'issue':
        return [
          `登记NG：${c.issue.title}，保留疑似根因，创建第${c.issue.rounds.at(-1)?.number}轮闭环`,
        ];
      case 'closeIssue':
        return ['关闭NG（需本轮回归通过、报告更新完成）'];
      case 'memory':
        return [`保存${c.memory.verified ? '已确认' : '待验证'}经验：${c.memory.content}`];
      case 'unresolved':
        return [`记录待解决事项：${c.item.reason}`];
      case 'resolve':
        return ['标记待解决事项已处理'];
    }
  });
  return {
    id: uid(),
    base: workRevision(p),
    rawText,
    source,
    level,
    commands,
    diff,
    questions: [],
    evidence: [],
  };
}
export function applyCommands(p: Project, commands: WorkCommand[]): Project {
  const next = structuredClone(p);
  next.workspace ??= emptyWorkspace();
  const w = next.workspace;
  for (const c of commands)
    switch (c.type) {
      case 'line': {
        const i = w.lines.findIndex((l) => l.id === c.line.id);
        if (i < 0) w.lines.push(c.line);
        else w.lines[i] = c.line;
        break;
      }
      case 'task': {
        const m = createMilestone(c.date);
        m.id = c.id;
        m.title = c.title;
        m.work = c.work;
        m.completed = c.work.status === 'done';
        m.side = next.milestones.length % 2 ? 'below' : 'above';
        next.milestones.push(m);
        if (c.date < next.startDate) next.startDate = c.date;
        if (c.date > next.endDate) next.endDate = c.date;
        break;
      }
      case 'update': {
        const n = next.milestones.find((n) => n.id === c.id);
        if (!n) throw new Error('目标节点不存在');
        if (n.locked) throw new Error('目标节点已锁定，请先解锁');
        n.work = { ...(n.work ?? newWork()), ...c.patch };
        n.completed = n.work.status === 'done';
        if (c.title !== undefined) n.title = c.title;
        break;
      }
      case 'dependency':
        w.dependencies.push(c.edge);
        break;
      case 'removeDependency':
        w.dependencies = w.dependencies.filter((e) => e.id !== c.id);
        break;
      case 'issue': {
        const i = w.issues.findIndex((i) => i.id === c.issue.id);
        if (i < 0) w.issues.push(c.issue);
        else w.issues[i] = c.issue;
        break;
      }
      case 'closeIssue': {
        const issue = w.issues.find((i) => i.id === c.id);
        if (!issue) throw new Error('异常不存在');
        issue.status = 'closed';
        break;
      }
      case 'memory': {
        const index = w.memories.findIndex((m) => m.id === c.memory.id);
        if (index < 0) w.memories.push(c.memory);
        else w.memories[index] = c.memory;
        break;
      }
      case 'unresolved':
        w.unresolved.push(c.item);
        break;
      case 'resolve': {
        const item = w.unresolved.find((i) => i.id === c.id);
        if (item) item.status = 'resolved';
        break;
      }
    }
  validateWork(next);
  for (const c of commands)
    if (
      c.type === 'update' &&
      c.patch.status === 'doing' &&
      p.milestones.find((n) => n.id === c.id)?.work?.status !== 'doing'
    ) {
      const reasons = blockers(next, c.id);
      if (reasons.length) throw new Error(`不能开始任务：${reasons.join('；')}`);
    }
  return next;
}
export function executeProposal(
  p: Project,
  draft: WorkProposal,
  confirmation: 'auto' | 'confirmed' | 'strong',
): Project {
  if (workRevision(p) !== draft.base) throw new Error('计划已变化，请重新生成预览后确认');
  const actual = proposal(p, draft.commands, draft.rawText, draft.source);
  if (draft.level > actual.level) actual.level = draft.level;
  if (
    (actual.level === 'L3' && confirmation !== 'strong') ||
    (actual.level === 'L2' && confirmation === 'auto')
  )
    throw new Error('此操作需要确认');
  if (actual.level === 'L1' && confirmation === 'auto' && !workspace(p).autoProgress)
    throw new Error('自动记录已关闭，请确认');
  const next = applyCommands(p, draft.commands);
  next.workspace!.pendingProposal = undefined;
  next.workspace!.audits.push({
    id: draft.id,
    at: new Date().toISOString(),
    source: draft.source,
    reason: draft.rawText,
    rawText: draft.rawText,
    level: actual.level,
    diff: actual.diff,
    ...auditDelta(p, next),
  });
  return next;
}
export function restoreSnapshot(p: Project, data: WorkSnapshot): Project {
  const next = structuredClone(p);
  const oldIds = new Set([...workNodes(p).map((n) => n.id), ...data.nodes.map((n) => n.id)]);
  const map = new Map(next.milestones.map((n) => [n.id, n]));
  next.milestones = next.milestones.filter((n) => !oldIds.has(n.id));
  next.milestones.push(
    ...data.nodes.map((n) => ({
      ...(map.get(n.id) ?? createMilestone(n.date)),
      ...structuredClone(n),
      work: n.work ? structuredClone(n.work) : undefined,
    })),
  );
  next.workspace = {
    ...workspace(p),
    ...structuredClone({
      lines: data.lines,
      dependencies: data.dependencies,
      issues: data.issues,
      memories: data.memories,
      unresolved: data.unresolved,
    }),
  };
  return next;
}
export function revertAudit(p: Project, id: string): Project {
  const entry = workspace(p).audits.find((a) => a.id === id);
  if (!entry) throw new Error('操作记录不存在');
  if (auditRevision(p) !== entry.afterRevision)
    throw new Error('之后已有相关修改。请先撤销较新的操作，或手动更正，避免覆盖新进展');
  const current = snapshot(p);
  const merge = <T extends { id: string }>(items: T[], before: T[], after: T[]) => {
    const touched = new Set([...before, ...after].map((item) => item.id));
    return [...items.filter((item) => !touched.has(item.id)), ...before];
  };
  const data: WorkSnapshot = {
    nodes: merge(current.nodes, entry.before.nodes, entry.after.nodes),
    lines: merge(current.lines, entry.before.lines, entry.after.lines),
    dependencies: merge(current.dependencies, entry.before.dependencies, entry.after.dependencies),
    issues: merge(current.issues, entry.before.issues, entry.after.issues),
    memories: merge(current.memories, entry.before.memories, entry.after.memories),
    unresolved: merge(current.unresolved, entry.before.unresolved, entry.after.unresolved),
  };
  const next = restoreSnapshot(p, data);
  validateWork(next);
  next.workspace!.audits.push({
    id: uid(),
    at: new Date().toISOString(),
    source: 'manual',
    reason: `撤销：${entry.reason}`,
    rawText: '',
    level: entry.level,
    diff: ['恢复此操作前的任务数据；原审计保留'],
    ...auditDelta(p, next),
    reverts: id,
  });
  return next;
}
export function appendManualAudit(before: Project, after: Project, reason: string): Project {
  if (workRevision(before) === workRevision(after)) return after;
  after.workspace ??= emptyWorkspace();
  if (workspace(before).audits.length !== after.workspace.audits.length) return after;
  const entry: WorkAudit = {
    id: uid(),
    at: new Date().toISOString(),
    source: 'manual',
    reason,
    rawText: '',
    level: 'L2',
    diff: [reason],
    ...auditDelta(before, after),
  };
  after.workspace.audits.push(entry);
  return after;
}
export function ngCommands(
  p: Project,
  testId: string,
  title: string,
  suspectedCause = '',
  existingId?: string,
): WorkCommand[] {
  const test = workNodes(p).find((n) => n.id === testId);
  if (!test) throw new Error('请先选择测试节点');
  const old = workspace(p).issues.find((i) => i.id === existingId);
  if (old?.status === 'closed') throw new Error('此异常已关闭，请新建异常');
  if (old && old.rounds.at(-1)?.result !== 'failed')
    throw new Error('请先登记本轮回归失败，再新增轮次');
  const round = (old?.rounds.length ?? 0) + 1;
  const tasks = ['根因定位', '整改实施', '回归测试', '报告更新'].map((name, i) => ({
    type: 'task' as const,
    id: uid(),
    title: `${title} · ${name} #${round}`,
    date: today(),
    work: {
      ...newWork(test.work.lineId),
      stage: test.work.stage,
      kind: i === 2 ? ('test' as const) : ('work' as const),
    },
  }));
  const commands: WorkCommand[] = [...tasks];
  tasks.slice(1).forEach((task, i) =>
    commands.push({
      type: 'dependency',
      edge: { id: uid(), from: tasks[i].id, to: task.id, hard: true, condition: 'done' },
    }),
  );
  commands.push({
    type: 'issue',
    issue: {
      id: old?.id ?? uid(),
      testId,
      title,
      suspectedCause: old?.suspectedCause || suspectedCause,
      confirmedCause: old?.confirmedCause ?? '',
      affectedIds:
        old?.affectedIds ??
        workNodes(p)
          .filter(
            (n) => n.work.lineId === test.work.lineId && ['archive', 'gate'].includes(n.work.kind),
          )
          .map((n) => n.id),
      status: 'open',
      rounds: [
        ...(old?.rounds ?? []),
        { number: round, taskIds: tasks.map((t) => t.id), result: 'pending' },
      ],
    },
  });
  return commands;
}
export function descendants(p: Project, id: string): string[] {
  const seen = new Set<string>();
  const queue = [id];
  for (let i = 0; i < queue.length; i++)
    for (const e of workspace(p).dependencies.filter((e) => e.from === queue[i] && e.hard))
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
  return [...seen];
}
export function dailyPlan(p: Project, date = today()) {
  const nodes = workNodes(p);
  const capacity = workspace(p).dailyHours;
  const remaining = (t: WorkTask) =>
    t.status === 'done'
      ? 0
      : (t.remainingHours ??
        (t.estimateHours !== null && t.progress !== null
          ? t.estimateHours * (1 - t.progress / 100)
          : t.estimateHours));
  const latestStarts = new Map<string, number | null>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A small backward pass, not a global calendar optimizer. Unknown downstream
  // effort intentionally leaves slack unknown rather than promising a safe delay.
  for (const id of topologicalWork(p).reverse()) {
    const t = byId.get(id)!.work;
    const hours = remaining(t);
    const successors = workspace(p)
      .dependencies.filter((e) => e.from === id && e.hard)
      .map((e) => e.to);
    const bounds = [
      ...(t.due ? [dayNumber(t.due) + 1] : []),
      ...(t.window ? [dayNumber(t.window.slice(0, 10))] : []),
    ];
    const unknown = successors.some((next) => latestStarts.get(next) === null);
    for (const next of successors) {
      const bound = latestStarts.get(next);
      if (bound !== null && bound !== undefined) bounds.push(bound);
    }
    latestStarts.set(
      id,
      hours === null || unknown || !bounds.length ? null : Math.min(...bounds) - hours / capacity,
    );
  }
  return nodes
    .filter((n) => !['done', 'cancelled'].includes(n.work.status))
    .map((n) => {
      const t = n.work;
      const blocked = blockers(p, n.id);
      const impacted = descendants(p, n.id);
      const hours = remaining(t);
      const latestStart = latestStarts.get(n.id) ?? null;
      const slack = latestStart === null ? null : latestStart - dayNumber(date);
      const dueDays = t.due ? dayNumber(t.due) - dayNumber(date) : null;
      const windowDays = t.window ? dayNumber(t.window.slice(0, 10)) - dayNumber(date) : null;
      const weeklyToday =
        t.recurringWeekday !== null && new Date(`${date}T12:00:00`).getDay() === t.recurringWeekday;
      const must =
        weeklyToday ||
        t.priority === 'P0' ||
        (slack !== null && slack < 1) ||
        (dueDays !== null && dueDays <= 0) ||
        (windowDays !== null && windowDays <= 0);
      const score =
        (must ? 100 : 0) +
        { P0: 40, P1: 25, P2: 10, P3: 0 }[t.priority] +
        Math.min(20, impacted.length * 4) +
        (dueDays !== null ? Math.max(0, 20 - dueDays * 3) : 0);
      const risk = [
        ...blocked,
        ...(t.blocker ? [t.blocker] : []),
        ...(dueDays !== null && dueDays < 0 ? [`已超过截止${-dueDays}天`] : []),
        ...(hours !== null && hours > capacity ? ['剩余工时超过单日容量'] : []),
        ...(slack !== null && slack < 0 ? ['按已填工时倒排，当前路径可能赶不上截止'] : []),
      ];
      const downstream = impacted.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
      const latest = [t.due, ...downstream.map((n) => n.work.due)].filter(Boolean).sort()[0];
      const canDefer =
        !must &&
        !risk.length &&
        hours !== null &&
        t.deadline === 'personal' &&
        !t.window &&
        t.recurringWeekday === null &&
        !downstream.some(
          (n) =>
            n.work.deadline === 'commitment' || n.work.window || n.work.recurringWeekday !== null,
        ) &&
        slack !== null &&
        slack > 1;
      const category = blocked.length
        ? '风险预警'
        : must
          ? '今日必做'
          : canDefer
            ? '可稍延期'
            : '建议推进';
      const reason = blocked.length
        ? `先解决前置：${blocked[0]}`
        : must
          ? weeklyToday
            ? '今天是已登记的每周会议窗口；具体场次尚需人工确认'
            : windowDays !== null && windowDays <= 0
              ? '窗口今天到期或已过期，请核对'
              : t.priority === 'P0'
                ? '人工指定P0'
                : slack !== null && slack < 1
                  ? '按已填工时和后继截止倒排，今天需要启动'
                  : '截止今天到期或已逾期'
          : canDefer
            ? '按已填工时及强依赖倒排存在余量；未改动日期，仍需核对未登记等待'
            : impacted.length
              ? `推进后可解除${impacted.length}个后继的依赖`
              : '可推进；暂无足够信息判定可延期';
      return {
        node: n,
        category,
        score,
        risk,
        reason,
        hours,
        impacted,
        latestStart:
          canDefer && latest && latestStart !== null
            ? addDays(date, Math.floor(latestStart - dayNumber(date)))
            : '',
        confidence: hours === null ? '信息不足' : '基于已填信息',
        memories: workspace(p)
          .memories.filter(
            (m) =>
              m.verified &&
              m.tags
                .split(/[，,、\s]+/)
                .some(
                  (tag) =>
                    tag.length >= 2 &&
                    `${n.title} ${workspace(p).lines.find((l) => l.id === t.lineId)?.title ?? ''} ${taskKinds[t.kind]}`.includes(
                      tag,
                    ),
                ),
          )
          .slice(0, 3)
          .map((m) => `${m.content}（${m.source}）`),
      };
    })
    .sort((a, b) => b.score - a.score);
}
