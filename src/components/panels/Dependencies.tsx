import { useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { Link, Milestone, Project } from '../../domain/types';
import { uid } from '../../domain/defaults';
import { reconcileLinks } from '../../engine/constraintEngine';
import { useEditor } from '../../store/editorStore';
import { Button, Field } from '../common/Controls';
import { useDraftGuard } from '../../hooks/useDraftGuard';
export function Dependencies({
  milestone: m,
  project,
}: {
  milestone: Milestone;
  project: Project;
}) {
  const [from, setFrom] = useState('');
  const [gap, setGap] = useState(0);
  const [preview, setPreview] = useState<{ project: Project; source: Project } | null>(null);
  const guard = useDraftGuard();
  const related = project.links.filter((l) => l.fromId === m.id || l.toId === m.id);
  const prepare = (links: Link[]) => {
    try {
      const next = reconcileLinks(project, links);
      if (next.milestones.some((n, i) => n.date !== project.milestones[i].date))
        setPreview({ project: next, source: project });
      else useEditor.getState().apply('修改事件关联', () => next);
    } catch (e) {
      useEditor.getState().notify((e as Error).message, 'error');
    }
  };
  return (
    <section className="form-section dependencies">
      <h3>
        依赖关系 <span>{related.length}</span>
      </h3>
      {related.length === 0 && <p className="muted small">设置前置事件，让日期变化自动传递。</p>}
      {related.map((l) => {
        const predecessor = l.toId === m.id;
        const other = project.milestones.find((n) => n.id === (predecessor ? l.fromId : l.toId));
        return (
          <div className="dependency-item" key={l.id}>
            <div className="dependency-title">
              <span>{predecessor ? '前置' : '后继'}</span>
              <button onClick={() => useEditor.getState().select(other!.id)} title="选中关联事件">
                {other?.title}
              </button>
              <Button
                title="删除关联"
                disabled={m.locked}
                onClick={() => prepare(project.links.filter((e) => e.id !== l.id))}
              >
                <Trash2 size={13} />
              </Button>
            </div>
            <div className="dependency-options">
              <label>
                <input
                  aria-label={`启用关联-${l.id}`}
                  type="checkbox"
                  checked={l.enabled}
                  disabled={m.locked}
                  onChange={(e) =>
                    prepare(
                      project.links.map((v) =>
                        v.id === l.id ? { ...v, enabled: e.target.checked } : v,
                      ),
                    )
                  }
                />
                启用
              </label>
              <label>
                间隔{' '}
                <input
                  aria-label={`最小间隔-${l.id}`}
                  type="number"
                  min="0"
                  max="36500"
                  defaultValue={l.minGapDays}
                  key={`${l.id}-${l.minGapDays}`}
                  disabled={m.locked}
                  onChange={(e) => guard(Number(e.target.value) !== l.minGapDays)}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== l.minGapDays)
                      prepare(
                        project.links.map((v) => (v.id === l.id ? { ...v, minGapDays: n } : v)),
                      );
                    guard(false);
                  }}
                />{' '}
                天
              </label>
            </div>
          </div>
        );
      })}
      <div className="field-grid">
        <Field label="新增前置事件" wide>
          <select
            aria-label="前置事件"
            value={from}
            disabled={m.locked}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value="">选择一个事件…</option>
            {project.milestones
              .filter((n) => n.id !== m.id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="最小间隔（天）">
          <input
            aria-label="新增最小间隔"
            type="number"
            min="0"
            max="36500"
            value={gap}
            disabled={m.locked}
            onChange={(e) => setGap(Number(e.target.value))}
          />
        </Field>
        <Button
          title="新增关联"
          className="add-link"
          disabled={!from || m.locked}
          onClick={() => {
            prepare([
              ...project.links,
              { id: uid(), fromId: from, toId: m.id, minGapDays: gap, enabled: true },
            ]);
            setFrom('');
          }}
        >
          <Plus size={14} />
          添加关联
        </Button>
      </div>
      {preview && (
        <div className="constraint-preview" role="alert">
          <strong>此关联需要调整日期</strong>
          {preview.project.milestones
            .filter((n, i) => n.date !== preview.source.milestones[i].date)
            .map((n) => (
              <p key={n.id}>
                {n.title}
                <br />
                {preview.source.milestones.find((o) => o.id === n.id)?.date}{' '}
                <ArrowRight size={11} /> {n.date}
              </p>
            ))}
          <div className="row">
            <Button
              title="应用日期调整"
              className="primary"
              onClick={() => {
                if (useEditor.getState().project !== preview.source)
                  useEditor.getState().notify('项目已变化，请重新添加关联', 'error');
                else useEditor.getState().apply('添加关联并调整日期', () => preview.project);
                setPreview(null);
              }}
            >
              应用调整
            </Button>
            <Button title="取消日期调整" onClick={() => setPreview(null)}>
              取消
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
