import { beforeEach, describe, it, expect } from 'vitest';
import { useEditor, isDirty } from '../src/store/editorStore';
import { changeDate } from '../src/engine/constraintEngine';
import { fixture, link } from './helpers';
beforeEach(() => useEditor.getState().load(fixture()));
describe('事务历史与脏状态', () => {
  it('新增、修改、删除可整次撤销重做', () => {
    useEditor.getState().add();
    expect(useEditor.getState().project.milestones).toHaveLength(4);
    useEditor.getState().undo();
    expect(useEditor.getState().project.milestones).toHaveLength(3);
    useEditor.getState().redo();
    expect(useEditor.getState().project.milestones).toHaveLength(4);
    useEditor.getState().select('A');
    useEditor.getState().update('A', { title: '修改' });
    useEditor.getState().undo();
    expect(useEditor.getState().project.milestones[0].title).toBe('A');
    useEditor.getState().select('A');
    useEditor.getState().remove();
    expect(useEditor.getState().project.milestones).toHaveLength(3);
    useEditor.getState().undo();
    expect(useEditor.getState().project.milestones).toHaveLength(4);
  });
  it('多次拖动预览和依赖传播只生成一条历史，撤销恢复整组日期', () => {
    const p = fixture();
    p.links = [link('A', 'B', 5), link('B', 'C', 5)];
    useEditor.getState().load(p);
    useEditor.getState().begin('拖拽');
    for (const date of ['2026-02-01', '2026-02-02', '2026-02-03'])
      useEditor.getState().preview(changeDate(p, 'A', date));
    useEditor.getState().commit();
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(p);
  });
  it('Escape 取消预览没有历史与脏状态', () => {
    const p = useEditor.getState().project;
    useEditor.getState().begin('拖动');
    useEditor.getState().preview(changeDate(p, 'A', '2026-02-03'));
    useEditor.getState().cancel();
    expect(useEditor.getState().past).toHaveLength(0);
    expect(isDirty(useEditor.getState())).toBe(false);
  });
  it('撤销后新操作清理 redo，保留至少 50 步', () => {
    for (let i = 0; i < 65; i++) useEditor.getState().update('A', { title: `事件 ${i}` });
    expect(useEditor.getState().past).toHaveLength(65);
    useEditor.getState().undo();
    useEditor.getState().update('A', { title: '新分支' });
    expect(useEditor.getState().future).toHaveLength(0);
  });
  it('选择、缩放、面板与主题不触发脏状态；撤销回基线恢复已保存', () => {
    useEditor.setState({ selectedId: 'A', zoom: 3, showProperties: false, theme: 'dark' });
    expect(isDirty(useEditor.getState())).toBe(false);
    useEditor.getState().update('A', { title: '修改' });
    expect(isDirty(useEditor.getState())).toBe(true);
    useEditor.getState().undo();
    expect(isDirty(useEditor.getState())).toBe(false);
  });
  it('删除节点清理关系，撤销一起恢复', () => {
    const p = fixture();
    p.links = [link('A', 'B', 5)];
    useEditor.getState().load(p);
    useEditor.getState().select('A');
    useEditor.getState().remove();
    expect(useEditor.getState().project.links).toHaveLength(0);
    useEditor.getState().undo();
    expect(useEditor.getState().project.links).toHaveLength(1);
  });
});
