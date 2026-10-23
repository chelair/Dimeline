import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  X,
  History,
  PanelRightOpen,
  Network,
  MousePointer2,
  Keyboard,
} from 'lucide-react';
import { useEditor, isDirty } from './store/editorStore';
import { useKeyboard } from './hooks/useKeyboard';
import { saveProject } from './services/desktopService';
import { TimelineCanvas, type CanvasCommands } from './components/timeline/TimelineCanvas';
import { Toolbar } from './components/toolbar/Toolbar';
import { PropertyPanel } from './components/panels/PropertyPanel';
import { RecentPanel } from './components/panels/RecentPanel';
import { Button } from './components/common/Controls';
export default function App() {
  const s = useEditor();
  const [commands, setCommands] = useState<CanvasCommands | null>(null);
  const [help, setHelp] = useState(false);
  const [version, setVersion] = useState('1.0.0');
  useKeyboard();
  const register = useCallback((c: CanvasCommands) => setCommands(c), []);
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    localStorage.setItem('dimeline-theme', s.theme);
  }, [s.theme]);
  useEffect(() => {
    void window.desktop?.getVersion().then(setVersion);
    const unsubscribe = useEditor.subscribe((state) => window.desktop?.setDirty(isDirty(state)));
    const remove = window.desktop?.onSaveBeforeClose(
      async () => (await saveProject()) && !isDirty(useEditor.getState()),
    );
    return () => {
      unsubscribe();
      remove?.();
    };
  }, []);
  useEffect(() => {
    document.title = `${isDirty(s) ? '● ' : ''}${s.project.title} — Dimeline`;
  }, [s]);
  const selected = s.project.milestones.find((m) => m.id === s.selectedId);
  return (
    <div className="app">
      <Toolbar commands={commands} onHelp={() => setHelp(true)} />
      <main className="workspace">
        <nav className="activity-rail">
          <Button title="时间线画布" className="active" onClick={() => s.select(null)}>
            <Network size={19} />
          </Button>
          <Button
            title="最近文件"
            className={s.showRecent ? 'active' : ''}
            onClick={() => useEditor.setState({ showRecent: !s.showRecent })}
          >
            <History size={19} />
          </Button>
          <div className="rail-spacer" />
          <Button title="操作帮助" onClick={() => setHelp(true)}>
            <Keyboard size={18} />
          </Button>
        </nav>
        {s.showRecent && <RecentPanel />}
        <TimelineCanvas onCommands={register} />
        <div className={`property-drawer ${s.showProperties ? 'open' : ''}`}>
          {s.showProperties && <PropertyPanel commands={commands} />}
        </div>
        {!s.showProperties && (
          <button
            className="reopen-panel"
            title="展开属性面板"
            onClick={() => useEditor.setState({ showProperties: true })}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
      </main>
      <footer className="statusbar">
        <div>
          <span>
            <MousePointer2 size={12} />
            {s.project.milestones.length} 个事件
          </span>
          <i />
          <span>{selected ? `已选中：${selected.title}` : '就绪'}</span>
          <span className="optional-label">
            {s.project.links.filter((l) => l.enabled).length} 个依赖
          </span>
        </div>
        <div>
          <span>{Math.round(s.zoom * 100)}%</span>
          <i />
          <span>
            可撤销 {s.past.length} · 可重做 {s.future.length}
          </span>
          <i />
          <span className={isDirty(s) ? 'dirty-text' : ''}>
            {isDirty(s) ? <Circle size={8} /> : <CheckCircle2 size={12} />}
            {isDirty(s) ? '未保存' : '已保存'}
          </span>
          <span>v{version}</span>
        </div>
      </footer>
      {s.notice && (
        <div className={`toast ${s.noticeKind}`} role="status">
          <span>{s.notice}</span>
          <Button title="关闭提示" onClick={() => useEditor.setState({ notice: '' })}>
            <X size={15} />
          </Button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="操作指南"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">MAKE TIME VISIBLE</span>
                <h2>让计划有迹可循</h2>
              </div>
              <Button title="关闭操作指南" onClick={() => setHelp(false)}>
                <X size={19} />
              </Button>
            </header>
            <p>日期与位置独立编辑。所有依赖传播、自动整理和拖拽都能整次撤销。</p>
            <div className="shortcut-list">
              {[
                ['拖动日期锚点', '调整事件日期与关联日期'],
                ['Alt + 左键 / 右键拖动框体', '只移动文本框位置'],
                ['双击文本框', '编辑标题 · Shift+Enter 换行'],
                ['空格 + 拖动', '平移画布'],
                ['Ctrl + 滚轮 / Shift + 滚轮', '缩放 / 水平滚动'],
                ['Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z', '撤销 / 重做'],
                ['Ctrl+D / Delete', '复制 / 删除选中事件'],
                ['Ctrl+S / Ctrl+Shift+S', '保存 / 另存为'],
                ['Ctrl+N / Ctrl+O', '新建 / 打开项目'],
                ['Escape', '取消拖拽、编辑或选中'],
              ].map(([a, b]) => (
                <div key={a}>
                  <kbd>{a}</kbd>
                  <span>{b}</span>
                </div>
              ))}
            </div>
            <p className="small muted">
              完全锁定阻止编辑与日期传播；布局锁定只保护位置。PNG 默认导出完整时间线，分辨率为 2
              倍。
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
