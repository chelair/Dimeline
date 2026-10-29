export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export type TaskKind =
  'work' | 'test' | 'review' | 'resource' | 'material' | 'declaration' | 'archive' | 'gate';
export interface WorkTask {
  lineId: string;
  stage: '' | 'TR3' | 'TR4' | 'TR5' | 'TR6';
  kind: TaskKind;
  status: TaskStatus;
  progress: number | null;
  estimated: boolean;
  remaining: string;
  blocker: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  due: string;
  baselineDue: string;
  deadline: 'personal' | 'commitment';
  estimateHours: number | null;
  remainingHours: number | null;
  condition:
    'pending' | 'submitted' | 'confirmed' | 'passed' | 'partial' | 'ready' | 'archived' | 'failed';
  organization: string;
  window: string;
  recurringWeekday: number | null;
  quantity: string;
  artifact: string;
  artifactVersion: string;
  notes: string;
}
export interface WorkLine {
  id: string;
  title: string;
  kind: 'main' | 'branch' | 'standalone';
  parentId: string;
  attachNodeId: string;
  finalNodeId: string;
  stage: WorkTask['stage'];
}
export interface WorkDependency {
  id: string;
  from: string;
  to: string;
  hard: boolean;
  condition: 'done' | 'passed' | 'confirmed' | 'ready';
}
export interface TestIssue {
  id: string;
  testId: string;
  title: string;
  suspectedCause: string;
  confirmedCause: string;
  affectedIds: string[];
  status: 'open' | 'closed';
  rounds: { number: number; taskIds: string[]; result: 'pending' | 'passed' | 'failed' }[];
}
export interface WorkMemory {
  id: string;
  type: 'rule' | 'lesson';
  content: string;
  tags: string;
  source: string;
  verified: boolean;
  createdAt: string;
}
export interface UnresolvedItem {
  id: string;
  text: string;
  reason: string;
  context: string;
  status: 'open' | 'resolved';
  createdAt: string;
}
export interface WorkSnapshot {
  nodes: { id: string; title: string; date: string; completed: boolean; work?: WorkTask }[];
  lines: WorkLine[];
  dependencies: WorkDependency[];
  issues: TestIssue[];
  memories: WorkMemory[];
  unresolved: UnresolvedItem[];
}
export interface WorkAudit {
  id: string;
  at: string;
  source: 'manual' | 'assistant';
  reason: string;
  rawText: string;
  level: 'L1' | 'L2' | 'L3';
  diff: string[];
  before: WorkSnapshot;
  after: WorkSnapshot;
  beforeRevision: string;
  afterRevision: string;
  reverts?: string;
}
export interface WorkSpace {
  pendingProposal?: WorkProposal;
  lines: WorkLine[];
  dependencies: WorkDependency[];
  issues: TestIssue[];
  memories: WorkMemory[];
  unresolved: UnresolvedItem[];
  audits: WorkAudit[];
  dailyHours: number;
  autoProgress: boolean;
  reportDraft: string;
}
export type WorkCommand =
  | { type: 'line'; line: WorkLine }
  | { type: 'task'; id: string; title: string; date: string; work: WorkTask }
  | { type: 'update'; id: string; patch: Partial<WorkTask>; title?: string }
  | { type: 'dependency'; edge: WorkDependency }
  | { type: 'removeDependency'; id: string }
  | { type: 'issue'; issue: TestIssue }
  | { type: 'closeIssue'; id: string }
  | { type: 'memory'; memory: WorkMemory }
  | { type: 'unresolved'; item: UnresolvedItem }
  | { type: 'resolve'; id: string };
export interface WorkProposal {
  id: string;
  base: string;
  rawText: string;
  source: 'manual' | 'assistant';
  level: 'L1' | 'L2' | 'L3';
  commands: WorkCommand[];
  diff: string[];
  questions: string[];
  evidence: string[];
}
export const taskKinds: Record<TaskKind, string> = {
  work: '工作',
  test: '测试',
  review: '评审',
  resource: '资源预约',
  material: '物料',
  declaration: '申报',
  archive: '归档',
  gate: '汇合/纪要',
};
export const taskStatuses: Record<TaskStatus, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
  cancelled: '已取消',
};
export function emptyWorkspace(): WorkSpace {
  return {
    lines: [],
    dependencies: [],
    issues: [],
    memories: [],
    unresolved: [],
    audits: [],
    dailyHours: 6,
    autoProgress: true,
    reportDraft: '',
  };
}
export function newWork(lineId = ''): WorkTask {
  return {
    lineId,
    stage: '',
    kind: 'work',
    status: 'todo',
    progress: null,
    estimated: false,
    remaining: '',
    blocker: '',
    priority: 'P2',
    due: '',
    baselineDue: '',
    deadline: 'personal',
    estimateHours: null,
    remainingHours: null,
    condition: 'pending',
    organization: '',
    window: '',
    recurringWeekday: null,
    quantity: '',
    artifact: '',
    artifactVersion: '',
    notes: '',
  };
}
