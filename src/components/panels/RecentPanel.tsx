import { useEffect, useState } from 'react';
import { FileText, FolderOpen, X } from 'lucide-react';
import { useEditor } from '../../store/editorStore';
import type { RecentFile } from '../../domain/types';
import { getRecents, openProject } from '../../services/desktopService';
import { Button } from '../common/Controls';
export function RecentPanel() {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const current = useEditor((s) => s.path);
  const revision = useEditor((s) => s.fileRevision);
  useEffect(() => {
    void getRecents().then(setFiles);
  }, [revision]);
  return (
    <aside className="recent-panel">
      <header className="panel-header">
        <strong>最近文件</strong>
        <Button title="收起历史文件" onClick={() => useEditor.setState({ showRecent: false })}>
          <X size={14} />
        </Button>
      </header>
      <Button title="浏览并打开项目" className="browse-files" onClick={() => void openProject()}>
        <FolderOpen size={15} />
        打开本地项目
      </Button>
      {!files.length && (
        <div className="recent-empty">
          <FileText size={26} />
          <p>还没有最近文件</p>
          <span>
            保存或打开项目后，
            <br />
            可以在这里快速找到它。
          </span>
        </div>
      )}
      {files.map((file) => (
        <div className={`recent-file ${file.path === current ? 'current' : ''}`} key={file.path}>
          <button
            className="file-open"
            title={file.path}
            onClick={() => void openProject(file.path)}
          >
            <FileText size={16} />
            <span>
              <strong>{file.name}</strong>
              <small>{file.path}</small>
              <time>{new Date(file.time).toLocaleString('zh-CN')}</time>
            </span>
          </button>
          <Button
            title="从历史列表移除"
            onClick={() => void window.desktop?.removeRecent(file.path).then(setFiles)}
          >
            <X size={12} />
          </Button>
        </div>
      ))}
    </aside>
  );
}
