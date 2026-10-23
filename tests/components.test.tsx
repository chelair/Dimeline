// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertyPanel } from '../src/components/panels/PropertyPanel';
import { useEditor, isDirty } from '../src/store/editorStore';
import { useKeyboard } from '../src/hooks/useKeyboard';
import { fixture } from './helpers';
beforeEach(() => {
  useEditor.getState().load(fixture());
  useEditor.getState().select('A');
});
afterEach(cleanup);
function KeyboardHarness() {
  useKeyboard();
  return (
    <>
      <input aria-label="编辑控件" />
      <div tabIndex={0}>画布</div>
    </>
  );
}
describe('属性面板与输入焦点', () => {
  it('未失焦草稿受到保存保护，一次输入只形成一次属性修改', () => {
    render(<PropertyPanel commands={null} />);
    const input = screen.getByLabelText('事件标题');
    fireEvent.change(input, { target: { value: '输入' } });
    fireEvent.change(input, { target: { value: '输入中文标题' } });
    expect(isDirty(useEditor.getState())).toBe(true);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().project.milestones[0].title).toBe('A');
    fireEvent.blur(input);
    expect(useEditor.getState().past).toHaveLength(1);
    expect(useEditor.getState().project.milestones[0].title).toBe('输入中文标题');
  });
  it('锁定事件不可编辑，允许解锁', () => {
    const p = fixture();
    p.milestones[0].locked = true;
    useEditor.getState().load(p);
    useEditor.getState().select('A');
    render(<PropertyPanel commands={null} />);
    expect((screen.getByLabelText('事件标题') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('锁定编辑'));
    expect(useEditor.getState().project.milestones[0].locked).toBe(false);
  });
  it('非法日期编辑回滚并重置控件，不破坏原日期', () => {
    render(<PropertyPanel commands={null} />);
    const input = screen.getByLabelText('事件日期') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(useEditor.getState().project.milestones[0].date).toBe('2026-01-10');
    expect(input.value).toBe('2026-01-10');
    expect(useEditor.getState().past).toHaveLength(0);
  });
  it('输入控件中的 Delete 不删除画布事件，离开控件后快捷键生效', () => {
    render(<KeyboardHarness />);
    fireEvent.keyDown(screen.getByLabelText('编辑控件'), { key: 'Delete' });
    expect(useEditor.getState().project.milestones).toHaveLength(3);
    fireEvent.keyDown(screen.getByText('画布'), { key: 'Delete' });
    expect(useEditor.getState().project.milestones).toHaveLength(2);
  });
});
