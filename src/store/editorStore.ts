import { create } from 'zustand';
import { createMilestone, createProject, uid } from '../domain/defaults';
import type { Milestone, Project } from '../domain/types';
import { changeDate } from '../engine/constraintEngine';
import { fingerprint, validateProject } from '../services/serialization';
import { appendManualAudit } from '../engine/workEngine';
import { emptyWorkspace } from '../domain/work';
import type { WorkProposal } from '../domain/work';
export interface HistoryEntry {
  project: Project;
  label: string;
}
interface EditorState {
  project: Project;
  selectedId: string | null;
  zoom: number;
  showProperties: boolean;
  showRecent: boolean;
  theme: 'light' | 'dark';
  past: HistoryEntry[];
  future: HistoryEntry[];
  transaction: { project: Project; label: string } | null;
  savedFingerprint: string;
  drafts: Record<string, boolean>;
  path: string | null;
  fileRevision: number;
  notice: string;
  noticeKind: 'info' | 'error';
  load(p: Project, path?: string): void;
  apply(label: string, transform: (p: Project) => Project): boolean;
  begin(label: string): void;
  preview(p: Project): void;
  commit(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  add(): void;
  remove(): void;
  duplicate(): void;
  update(id: string, patch: Partial<Milestone>): boolean;
  markSaved(p: Project, path: string): void;
  setReportDraft(text: string): void;
  setProposalDraft(draft: WorkProposal | null): void;
  notify(message: string, kind?: 'info' | 'error'): void;
}
const initial = createProject();
export const useEditor = create<EditorState>((set, get) => ({
  project: initial,
  selectedId: null,
  zoom: 1,
  showProperties: true,
  showRecent: false,
  theme:
    typeof localStorage !== 'undefined' && localStorage.getItem('dimeline-theme') === 'dark'
      ? 'dark'
      : 'light',
  past: [],
  future: [],
  transaction: null,
  path: null,
  fileRevision: 0,
  drafts: {},
  savedFingerprint: fingerprint(initial),
  notice: '',
  noticeKind: 'info',
  load: (p, path) =>
    set({
      project: p,
      path: path ?? null,
      drafts: {},
      fileRevision: get().fileRevision + 1,
      savedFingerprint: fingerprint(p),
      past: [],
      future: [],
      transaction: null,
      selectedId: null,
      zoom: 1,
    }),
  apply: (label, transform) => {
    if (get().transaction) return false;
    try {
      const old = get().project;
      const p = appendManualAudit(old, transform(structuredClone(old)), label);
      validateProject(p);
      if (fingerprint(p) === fingerprint(old)) return true;
      set({ project: p, past: [...get().past, { project: old, label }].slice(-100), future: [] });
      return true;
    } catch (e) {
      get().notify((e as Error).message, 'error');
      return false;
    }
  },
  begin: (label) => {
    if (!get().transaction) set({ transaction: { project: get().project, label } });
  },
  preview: (project) => {
    if (get().transaction) set({ project });
  },
  commit: () => {
    const { transaction, project, past } = get();
    if (!transaction) return;
    if (fingerprint(project) !== fingerprint(transaction.project))
      set({
        project: appendManualAudit(
          transaction.project,
          structuredClone(project),
          transaction.label,
        ),
        past: [...past, { project: transaction.project, label: transaction.label }].slice(-100),
        future: [],
        transaction: null,
      });
    else set({ transaction: null });
  },
  cancel: () => {
    const t = get().transaction;
    if (t) set({ project: t.project, transaction: null });
  },
  undo: () => {
    const { past, project, future, transaction } = get();
    if (transaction) {
      get().cancel();
      return;
    }
    const item = past.at(-1);
    if (!item) return;
    set({
      project: appendManualAudit(
        project,
        {
          ...structuredClone(item.project),
          ...(project.workspace
            ? {
                workspace: {
                  ...(item.project.workspace ?? emptyWorkspace()),
                  audits: project.workspace.audits,
                },
              }
            : {}),
        },
        `撤销：${item.label}`,
      ),
      past: past.slice(0, -1),
      future: [...future, { project, label: item.label }],
      selectedId: null,
    });
  },
  redo: () => {
    const { past, project, future, transaction } = get();
    if (transaction) return;
    const item = future.at(-1);
    if (!item) return;
    set({
      project: appendManualAudit(
        project,
        {
          ...structuredClone(item.project),
          ...(project.workspace
            ? {
                workspace: {
                  ...(item.project.workspace ?? emptyWorkspace()),
                  audits: project.workspace.audits,
                },
              }
            : {}),
        },
        `重做：${item.label}`,
      ),
      future: future.slice(0, -1),
      past: [...past, { project, label: item.label }],
      selectedId: null,
    });
  },
  select: (selectedId) => set({ selectedId }),
  add: () => {
    const { project, selectedId } = get();
    const selected = project.milestones.find((m) => m.id === selectedId);
    const m = createMilestone(selected?.date ?? project.startDate);
    m.side = project.milestones.length % 2 ? 'below' : 'above';
    if (get().apply('新增事件', (p) => ({ ...p, milestones: [...p.milestones, m] })))
      set({ selectedId: m.id, showProperties: true });
  },
  remove: () => {
    const { selectedId, project } = get();
    const m = project.milestones.find((m) => m.id === selectedId);
    if (!m) return;
    if (m.locked) {
      get().notify('请先解锁事件再删除', 'error');
      return;
    }
    if (
      get().apply('删除事件', (p) => ({
        ...p,
        milestones: p.milestones.filter((m) => m.id !== selectedId),
        links: p.links.filter((l) => l.fromId !== selectedId && l.toId !== selectedId),
      }))
    )
      set({ selectedId: null });
  },
  duplicate: () => {
    const m = get().project.milestones.find((m) => m.id === get().selectedId);
    if (!m) return;
    const copy = {
      ...m,
      id: uid(),
      title: m.title + ' 副本',
      locked: false,
      layoutLocked: false,
      offsetX: m.offsetX + 24,
      offsetY: m.offsetY + 36,
    };
    if (get().apply('复制事件', (p) => ({ ...p, milestones: [...p.milestones, copy] })))
      set({ selectedId: copy.id });
  },
  update: (id, patch) =>
    get().apply('修改事件', (p) => {
      const m = p.milestones.find((m) => m.id === id);
      if (!m) throw new Error('事件不存在');
      if (m.locked && !(Object.keys(patch).length === 1 && patch.locked === false))
        throw new Error('事件已锁定，请先解锁');
      const next = patch.date ? changeDate(p, id, patch.date) : p;
      return {
        ...next,
        milestones: next.milestones.map((m) =>
          m.id === id
            ? {
                ...m,
                ...patch,
                ...(m.work && patch.completed !== undefined
                  ? {
                      work: {
                        ...m.work,
                        status: patch.completed ? ('done' as const) : ('todo' as const),
                        progress: patch.completed ? 100 : 0,
                        estimated: false,
                      },
                    }
                  : {}),
              }
            : m,
        ),
      };
    }),
  markSaved: (p, path) =>
    set({ savedFingerprint: fingerprint(p), path, fileRevision: get().fileRevision + 1 }),
  setReportDraft: (reportDraft) =>
    set((state) => ({
      project: {
        ...state.project,
        workspace: { ...(state.project.workspace ?? emptyWorkspace()), reportDraft },
      },
    })),
  setProposalDraft: (pendingProposal) =>
    set((state) => ({
      project: {
        ...state.project,
        workspace: {
          ...(state.project.workspace ?? emptyWorkspace()),
          pendingProposal: pendingProposal ?? undefined,
        },
      },
    })),
  notify: (notice, noticeKind = 'info') => set({ notice, noticeKind }),
}));
export const isDirty = (state: Pick<EditorState, 'project' | 'savedFingerprint' | 'drafts'>) =>
  fingerprint(state.project) !== state.savedFingerprint ||
  Object.values(state.drafts).some(Boolean);
