import { afterEach, describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deserialize, serialize } from '../src/services/serialization';
import { atomicWrite, readProject, writeProject } from '../electron/services/fileService';
import { fixture, link } from './helpers';
import { saveProject, openProject } from '../src/services/desktopService';
import { useEditor, isDirty } from '../src/store/editorStore';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('文件与迁移', () => {
  it('JSON 往返只包含持久化内容', () => {
    const p = fixture();
    expect(deserialize(serialize(p)).project).toEqual(p);
    expect(serialize(p)).not.toContain('selectedId');
  });
  it('兼容无版本文件、predecessors、manualOffset、boxFillEnabled，显式间隔优先', () => {
    const p = fixture();
    p.links = [link('A', 'B', 4)];
    const old = {
      ...p,
      milestones: p.milestones.map((m) => ({
        ...m,
        offsetX: undefined,
        offsetY: undefined,
        fillEnabled: undefined,
        manualOffsetX: 38,
        manualOffsetY: 150,
        boxFillEnabled: false,
        predecessors: m.id === 'B' ? ['A'] : [],
      })),
    };
    const next = deserialize(JSON.stringify(old));
    expect(next.project.links).toHaveLength(1);
    expect(next.project.links[0].minGapDays).toBe(4);
    expect(next.project.milestones[0]).toMatchObject({
      offsetX: 38,
      offsetY: 150,
      fillEnabled: false,
      layout: 'manual',
    });
  });
  it('非法 JSON、日期和未来版本拒绝，旧循环提供诊断', () => {
    expect(() => deserialize('{')).toThrow('JSON');
    expect(() => deserialize(JSON.stringify({ schemaVersion: 999, project: fixture() }))).toThrow(
      '版本',
    );
    const p = fixture();
    p.milestones[0].date = '2026-02-30';
    expect(() => deserialize(JSON.stringify(p))).toThrow('日期');
    const q = fixture();
    q.links = [link('A', 'B'), link('B', 'A')];
    const result = deserialize(JSON.stringify(q));
    expect(result.project.links).toHaveLength(1);
    expect(result.warnings.join()).toContain('循环');
  });
  it('真实文件原子保存及加载，失败不破坏原文件', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dimeline-unit-'));
    const file = path.join(dir, '项目.json');
    try {
      await writeProject(file, fixture());
      expect((await readProject(file)).project).toEqual(fixture());
      const before = await fs.readFile(file, 'utf8');
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('磁盘写入失败'));
      await expect(atomicWrite(file, 'invalid')).rejects.toThrow('磁盘');
      expect(await fs.readFile(file, 'utf8')).toBe(before);
      expect((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'))).toHaveLength(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
  it('保存失败、另存为取消保留脏状态；读取失败保留当前项目', async () => {
    useEditor.getState().load(fixture());
    useEditor.getState().update('A', { title: '未保存' });
    const mock = {
      saveProject: vi.fn().mockResolvedValue({ ok: false, error: '权限不足' }),
      setDirty: vi.fn(),
      confirmReplace: vi.fn().mockResolvedValue('discard'),
      openProject: vi.fn().mockResolvedValue({ ok: false, error: '文件已移动' }),
    };
    vi.stubGlobal('window', { desktop: mock });
    expect(await saveProject()).toBe(false);
    expect(isDirty(useEditor.getState())).toBe(true);
    mock.saveProject.mockResolvedValue({ ok: false, error: '取消', cancelled: true });
    expect(await saveProject(true)).toBe(false);
    expect(isDirty(useEditor.getState())).toBe(true);
    const project = useEditor.getState().project;
    await openProject();
    expect(useEditor.getState().project).toBe(project);
  });
});
