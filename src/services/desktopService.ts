import { useEditor, isDirty } from '../store/editorStore';
import { createProject } from '../domain/defaults';
import type { RecentFile } from '../domain/types';
let saving: Promise<boolean> | null = null;
export async function saveProject(saveAs = false): Promise<boolean> {
  if (saving) return saving;
  const task = (async () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const state = useEditor.getState();
    if (state.transaction) {
      state.notify('请先完成当前拖拽或编辑', 'error');
      return false;
    }
    const project = structuredClone(state.project);
    if (!window.desktop) {
      state.notify('本地文件操作请在 Electron 桌面窗口中使用', 'error');
      return false;
    }
    try {
      const result = await window.desktop.saveProject(project, saveAs);
      if (!result.ok) {
        if (!result.cancelled) state.notify(`保存失败：${result.error}`, 'error');
        return false;
      }
      useEditor.getState().markSaved(project, result.value.path);
      window.desktop.setDirty(isDirty(useEditor.getState()));
      useEditor.getState().notify('项目已保存');
      return true;
    } catch (e) {
      useEditor.getState().notify(`保存失败：${(e as Error).message}`, 'error');
      return false;
    }
  })();
  saving = task;
  try {
    return await task;
  } finally {
    saving = null;
  }
}
async function canReplace() {
  if (useEditor.getState().transaction) {
    useEditor.getState().notify('请先完成当前操作', 'error');
    return false;
  }
  if (!isDirty(useEditor.getState())) return true;
  if (!window.desktop) return false;
  const action = await window.desktop.confirmReplace();
  return action === 'discard' || (action === 'save' && (await saveProject()));
}
export async function openProject(path?: string) {
  if (!(await canReplace())) return;
  if (!window.desktop) {
    useEditor.getState().notify('请使用 Electron 桌面窗口打开项目', 'error');
    return;
  }
  try {
    const result = await window.desktop.openProject(path);
    if (!result.ok) {
      if (!result.cancelled) useEditor.getState().notify(`打开失败：${result.error}`, 'error');
      return;
    }
    const { project, warnings, path: target } = result.value;
    useEditor.getState().load(project, target);
    useEditor
      .getState()
      .notify(warnings.length ? `加载完成；迁移诊断：${warnings.join('；')}` : '项目已打开');
  } catch (e) {
    useEditor.getState().notify(`打开失败：${(e as Error).message}`, 'error');
  }
}
export async function newProject() {
  if (!(await canReplace())) return;
  await window.desktop?.resetPath();
  useEditor.getState().load(createProject());
}
export async function getRecents(): Promise<RecentFile[]> {
  return window.desktop ? window.desktop.getRecentFiles() : [];
}
