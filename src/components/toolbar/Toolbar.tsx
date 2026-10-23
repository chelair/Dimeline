import {
  Plus,
  FolderOpen,
  Save,
  FilePlus2,
  Download,
  Undo2,
  Redo2,
  SlidersHorizontal,
  History,
  Sun,
  Moon,
  Minus,
  Maximize2,
  WandSparkles,
  ChevronDown,
  Keyboard,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { useEditor, isDirty } from '../../store/editorStore';
import { newProject, openProject, saveProject } from '../../services/desktopService';
import type { CanvasCommands } from '../timeline/TimelineCanvas';
import { Button } from '../common/Controls';
export function Toolbar({
  commands,
  onHelp,
}: {
  commands: CanvasCommands | null;
  onHelp: () => void;
}) {
  const s = useEditor();
  const [fileMenu, setFileMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <strong>
            dimeline<span>时间线工作室</span>
          </strong>
        </div>
        <div className="document-name">
          <button
            title="编辑项目设置"
            onClick={() => useEditor.setState({ selectedId: null, showProperties: true })}
          >
            {s.project.title}
            <ChevronDown size={13} />
          </button>
          <span className={isDirty(s) ? 'save-state dirty' : 'save-state'}>
            {isDirty(s) ? '未保存修改' : '已保存'}
          </span>
        </div>
        <div className="header-actions">
          <Button title="快捷键与操作帮助" onClick={onHelp}>
            <Keyboard size={17} />
          </Button>
          <Button
            title="切换浅色/深色主题"
            onClick={() => useEditor.setState({ theme: s.theme === 'light' ? 'dark' : 'light' })}
          >
            {s.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </Button>
          <span className="local-badge">
            <i />
            本地工作空间
          </span>
        </div>
      </header>
      <div className="toolbar">
        <div className="toolbar-group">
          <div className="menu-wrap">
            <Button
              title="项目文件"
              className={fileMenu ? 'active' : ''}
              onClick={() => setFileMenu(!fileMenu)}
            >
              <FolderOpen size={16} />
              <span>文件</span>
              <ChevronDown size={12} />
            </Button>
            {fileMenu && (
              <>
                <div className="menu-backdrop" onClick={() => setFileMenu(false)} />
                <div className="dropdown">
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      void newProject();
                    }}
                  >
                    <FilePlus2 size={15} />
                    新建项目 <kbd>Ctrl N</kbd>
                  </button>
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      void openProject();
                    }}
                  >
                    <FolderOpen size={15} />
                    打开项目 <kbd>Ctrl O</kbd>
                  </button>
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      void saveProject();
                    }}
                  >
                    <Save size={15} />
                    保存 <kbd>Ctrl S</kbd>
                  </button>
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      void saveProject(true);
                    }}
                  >
                    <Save size={15} />
                    另存为 <kbd>Ctrl ⇧ S</kbd>
                  </button>
                </div>
              </>
            )}
          </div>
          <Button title="保存项目（Ctrl+S）" onClick={() => void saveProject()}>
            <Save size={16} />
          </Button>
          <span className="separator" />
          <Button title="撤销（Ctrl+Z）" disabled={!s.past.length} onClick={s.undo}>
            <Undo2 size={17} />
          </Button>
          <Button title="重做（Ctrl+Y）" disabled={!s.future.length} onClick={s.redo}>
            <Redo2 size={17} />
          </Button>
          <span className="separator" />
          <Button title="新建事件" className="primary" onClick={s.add}>
            <Plus size={16} />
            <span>新建事件</span>
          </Button>
          <Button title="自动整理布局（可撤销）" onClick={() => commands?.tidy()}>
            <WandSparkles size={16} />
            <span className="optional-label">自动整理</span>
          </Button>
        </div>
        <div className="toolbar-group right">
          <div className="zoom-controls">
            <Button
              title="缩小"
              disabled={s.zoom <= 1}
              onClick={() => commands?.zoom(s.zoom - 0.2)}
            >
              <Minus size={14} />
            </Button>
            <select
              aria-label="缩放倍率"
              value={s.zoom}
              onChange={(e) => commands?.zoom(Number(e.target.value))}
            >
              {Array.from({ length: 21 }, (_, i) => Math.round((1 + i * 0.2) * 10) / 10).map(
                (n) => (
                  <option key={n} value={n}>
                    {Math.round(n * 100)}%
                  </option>
                ),
              )}
            </select>
            <Button
              title="放大"
              disabled={s.zoom >= 5}
              onClick={() => commands?.zoom(s.zoom + 0.2)}
            >
              <Plus size={14} />
            </Button>
            <Button title="重置视图" onClick={() => commands?.reset()}>
              <Maximize2 size={14} />
            </Button>
          </div>
          <span className="separator" />
          <Button
            title="最近文件"
            className={s.showRecent ? 'active' : ''}
            onClick={() => useEditor.setState({ showRecent: !s.showRecent })}
          >
            <History size={16} />
          </Button>
          <Button
            title="属性面板"
            className={s.showProperties ? 'active' : ''}
            onClick={() => useEditor.setState({ showProperties: !s.showProperties })}
          >
            <SlidersHorizontal size={16} />
          </Button>
          <div className="menu-wrap">
            <Button
              title="导出 PNG"
              className="export-button"
              onClick={() => setExportMenu(!exportMenu)}
            >
              <Download size={16} />
              <span>导出</span>
              <ChevronDown size={12} />
            </Button>
            {exportMenu && (
              <>
                <div className="menu-backdrop" onClick={() => setExportMenu(false)} />
                <div className="dropdown align-right">
                  <button
                    onClick={() => {
                      setExportMenu(false);
                      void commands?.exportPng();
                    }}
                  >
                    完整时间线 · PNG @2x
                  </button>
                  <button
                    onClick={() => {
                      setExportMenu(false);
                      void commands?.exportPng(true);
                    }}
                  >
                    当前视口 · PNG @2x
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="workspace-heading">
        <div>
          <span className="workspace-dot" />
          <strong>{s.project.title}</strong>
          <span className="count-chip">{s.project.milestones.length} 个事件</span>
        </div>
        <button
          onClick={() => useEditor.setState({ selectedId: null, showProperties: true })}
          title="项目设置"
        >
          <Settings2 size={13} />
          项目设置
        </button>
      </div>
    </>
  );
}
