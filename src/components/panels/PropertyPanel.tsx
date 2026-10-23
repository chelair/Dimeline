import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { SlidersHorizontal, X, Copy, Trash2, LockKeyhole, ArrowUpRight } from 'lucide-react';
import { useEditor } from '../../store/editorStore';
import type { Milestone } from '../../domain/types';
import { presets } from '../../domain/defaults';
import { Button, Check, Field, Section } from '../common/Controls';
import { Dependencies } from './Dependencies';
import type { CanvasCommands } from '../timeline/TimelineCanvas';
import { useDraftGuard } from '../../hooks/useDraftGuard';
function Draft({
  value,
  onCommit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | number;
  onCommit: (value: string) => boolean | void;
}) {
  const [draft, setDraft] = useState(String(value));
  const guard = useDraftGuard();
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      {...props}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        guard(e.target.value !== String(value));
      }}
      onBlur={() => {
        if (draft !== String(value) && onCommit(draft) === false) setDraft(String(value));
        guard(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = String(value);
          setDraft(String(value));
          guard(false);
          e.preventDefault();
        }
      }}
    />
  );
}
function TitleInput({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (s: string) => boolean;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const guard = useDraftGuard();
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      aria-label="事件标题"
      rows={3}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        guard(e.target.value !== value);
      }}
      onBlur={() => {
        if (draft !== value && !onCommit(draft.trim())) setDraft(value);
        guard(false);
      }}
    />
  );
}
function ProjectProperties() {
  const project = useEditor((s) => s.project);
  const update = (patch: Partial<typeof project>) =>
    useEditor.getState().apply('修改项目设置', (p) => ({ ...p, ...patch }));
  return (
    <>
      <div className="panel-intro">
        <span className="eyebrow">PROJECT SETTINGS</span>
        <h2>项目设置</h2>
        <p>
          定义时间范围与主线外观。
          <br />
          选择事件可编辑详细属性。
        </p>
      </div>
      <Section title="基本信息">
        <Field label="项目名称" wide>
          <Draft
            aria-label="项目名称"
            value={project.title}
            maxLength={200}
            onCommit={(title) => update({ title: title.trim() || '未命名项目' })}
          />
        </Field>
        <Field label="开始日期" wide>
          <Draft
            aria-label="项目开始日期"
            type="date"
            value={project.startDate}
            onCommit={(startDate) => update({ startDate })}
          />
        </Field>
        <Field label="结束日期" wide>
          <Draft
            aria-label="项目结束日期"
            type="date"
            value={project.endDate}
            onCommit={(endDate) => update({ endDate })}
          />
        </Field>
      </Section>
      <Section title="主时间线">
        <Field label="线条颜色">
          <input
            aria-label="主线颜色"
            type="color"
            value={project.mainLine.color}
            onChange={(e) => update({ mainLine: { ...project.mainLine, color: e.target.value } })}
          />
        </Field>
        <Field label="线宽（pt）">
          <Draft
            type="number"
            min="1"
            max="10"
            step="0.5"
            value={project.mainLine.width}
            onCommit={(width) => {
              const n = Number(width);
              if (n >= 1 && n <= 10) update({ mainLine: { ...project.mainLine, width: n } });
            }}
          />
        </Field>
      </Section>
      <div className="project-note">
        <ArrowUpRight size={18} />
        <p>
          日期依赖超出时间范围时，
          <br />
          请先在这里扩展项目日期。
        </p>
      </div>
    </>
  );
}
export function PropertyPanel({ commands }: { commands: CanvasCommands | null }) {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selectedId);
  const m = project.milestones.find((n) => n.id === selected);
  const update = (patch: Partial<Milestone>) => {
    if (!m) return false;
    if (patch.layoutLocked === true || patch.locked === true) {
      const scene = commands?.getScene();
      const n = scene?.nodes.find((n) => n.id === m.id);
      if (scene && n)
        patch = {
          ...patch,
          layout: 'manual',
          offsetX: n.x + n.width / 2 - n.anchorX,
          offsetY: m.side === 'above' ? scene.axisY - n.y - n.height : n.y - scene.axisY,
        };
    }
    return useEditor.getState().update(m.id, patch);
  };
  const numeric = (key: keyof Milestone, min: number, max: number) => (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      useEditor.getState().notify(`请输入 ${min}～${max} 之间的数值`, 'error');
      return false;
    }
    return update({ [key]: n });
  };
  return (
    <aside className="property-panel" aria-label="属性面板">
      <header className="panel-header">
        <div>
          <SlidersHorizontal size={15} />
          <strong>{m ? '事件属性' : '项目属性'}</strong>
        </div>
        <Button title="收起属性面板" onClick={() => useEditor.setState({ showProperties: false })}>
          <X size={15} />
        </Button>
      </header>
      <div className="panel-content">
        {m ? (
          <div key={m.id}>
            <div className="selected-summary">
              <span className={`level-tag l${m.level}`}>L{m.level}</span>
              <span>{m.completed ? '已完成' : '进行中'}</span>
              <Button title="复制事件（Ctrl+D）" onClick={() => useEditor.getState().duplicate()}>
                <Copy size={14} />
              </Button>
            </div>
            {m.locked && (
              <div className="locked-message">
                <LockKeyhole size={14} />
                事件已锁定，仅可查看和解锁。
              </div>
            )}
            <Section title="基本信息">
              <Field label="事件标题" wide>
                <TitleInput
                  value={m.title}
                  onCommit={(title) => update({ title })}
                  disabled={m.locked}
                />
              </Field>
              <Field label="事件日期" wide>
                <Draft
                  aria-label="事件日期"
                  type="date"
                  value={m.date}
                  disabled={m.locked}
                  onCommit={(date) => update({ date })}
                />
              </Field>
              <Field label="显示位置">
                <select
                  aria-label="显示位置"
                  value={m.side}
                  disabled={m.locked || m.layoutLocked}
                  onChange={(e) => update({ side: e.target.value as Milestone['side'] })}
                >
                  <option value="above">时间线上方</option>
                  <option value="below">时间线下方</option>
                </select>
              </Field>
              <Field label="事件层级">
                <select
                  aria-label="事件层级"
                  value={m.level}
                  disabled={m.locked}
                  onChange={(e) => {
                    const level = Number(e.target.value) as Milestone['level'];
                    update({ level, ...presets[level] });
                  }}
                >
                  {[1, 2, 3, 4].map((l) => (
                    <option key={l} value={l}>
                      L{l} · {['关键节点', '主要事件', '次要事件', '细节事件'][l - 1]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="wide checks">
                <Check
                  label="标记为已完成"
                  checked={m.completed}
                  disabled={m.locked}
                  onChange={(completed) => update({ completed })}
                />
                <Check
                  label="锁定编辑"
                  checked={m.locked}
                  onChange={(locked) => update({ locked })}
                />
                <Check
                  label="锁定布局"
                  checked={m.layoutLocked}
                  disabled={m.locked}
                  onChange={(layoutLocked) => update({ layoutLocked })}
                />
              </div>
            </Section>
            <fieldset disabled={m.locked}>
              <Section title="文字样式">
                <Field label="字体" wide>
                  <select
                    aria-label="字体"
                    value={m.fontFamily}
                    onChange={(e) => update({ fontFamily: e.target.value })}
                  >
                    {[
                      'system-ui',
                      'PingFang SC',
                      'Microsoft YaHei',
                      'SimSun',
                      'Arial',
                      'Georgia',
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f === 'system-ui' ? '系统默认' : f}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="描述字号">
                  <Draft
                    aria-label="描述字号"
                    type="number"
                    min="8"
                    max="48"
                    value={m.fontSize}
                    onCommit={numeric('fontSize', 8, 48)}
                  />
                </Field>
                <Field label="日期字号">
                  <Draft
                    aria-label="日期字号"
                    type="number"
                    min="8"
                    max="36"
                    value={m.dateFontSize}
                    onCommit={numeric('dateFontSize', 8, 36)}
                  />
                </Field>
                <Field label="文字颜色">
                  <input
                    aria-label="文字颜色"
                    type="color"
                    value={m.textColor}
                    onChange={(e) => update({ textColor: e.target.value })}
                  />
                </Field>
                <Check label="加粗" checked={m.bold} onChange={(bold) => update({ bold })} />
              </Section>
              <Section title="连接箭头">
                <Field label="箭头颜色">
                  <input
                    aria-label="箭头颜色"
                    type="color"
                    value={m.arrowColor}
                    onChange={(e) => update({ arrowColor: e.target.value })}
                  />
                </Field>
                <Field label="线宽（pt）">
                  <Draft
                    aria-label="箭头线宽"
                    type="number"
                    min="1"
                    max="6"
                    step="0.5"
                    value={m.arrowWidth}
                    onCommit={numeric('arrowWidth', 1, 6)}
                  />
                </Field>
                <Field label="线路形态" wide>
                  <select
                    value={m.arrowType}
                    onChange={(e) =>
                      update({ arrowType: e.target.value as Milestone['arrowType'] })
                    }
                  >
                    <option value="elbow">自动正交折线</option>
                    <option value="straight">优先直连（正交避让）</option>
                  </select>
                </Field>
              </Section>
              <Section title="文本框">
                <Check
                  label="启用填充"
                  checked={m.fillEnabled}
                  onChange={(fillEnabled) => update({ fillEnabled })}
                />
                <Field label="填充颜色">
                  <input
                    type="color"
                    value={m.fillColor}
                    onChange={(e) => update({ fillColor: e.target.value })}
                  />
                </Field>
                <Field label="边框样式">
                  <select
                    value={m.borderStyle}
                    onChange={(e) =>
                      update({ borderStyle: e.target.value as Milestone['borderStyle'] })
                    }
                  >
                    <option value="solid">实线</option>
                    <option value="dashed">虚线</option>
                    <option value="none">无边框</option>
                  </select>
                </Field>
                <Field label="边框颜色">
                  <input
                    type="color"
                    value={m.borderColor}
                    onChange={(e) => update({ borderColor: e.target.value })}
                  />
                </Field>
                <Field label="边框粗细">
                  <Draft
                    type="number"
                    min="0"
                    max="8"
                    step="0.5"
                    value={m.borderWidth}
                    onCommit={numeric('borderWidth', 0, 8)}
                  />
                </Field>
                <Check
                  label="自动尺寸"
                  checked={m.autoSize}
                  onChange={(autoSize) => update({ autoSize })}
                />
                <Field label={m.autoSize ? '最小宽度' : '宽度'}>
                  <Draft
                    aria-label="文本框宽度"
                    type="number"
                    min="64"
                    max="1200"
                    value={m.width}
                    onCommit={numeric('width', 64, 1200)}
                  />
                </Field>
                <Field label={m.autoSize ? '最小高度' : '高度'}>
                  <Draft
                    type="number"
                    min="32"
                    max="1200"
                    value={m.height}
                    onCommit={numeric('height', 32, 1200)}
                  />
                </Field>
              </Section>
              <Section title="布局">
                <Field label="布局方式" wide>
                  <select
                    aria-label="布局方式"
                    disabled={m.layoutLocked}
                    value={m.layout}
                    onChange={(e) => update({ layout: e.target.value as Milestone['layout'] })}
                  >
                    <option value="auto">自动避让</option>
                    <option value="manual">手动位置</option>
                  </select>
                </Field>
                <Field label="水平偏移">
                  <Draft
                    type="number"
                    disabled={m.layoutLocked}
                    value={m.offsetX}
                    onCommit={numeric('offsetX', -10000, 10000)}
                  />
                </Field>
                <Field label="距主线距离">
                  <Draft
                    type="number"
                    disabled={m.layoutLocked}
                    min="0"
                    value={m.offsetY}
                    onCommit={numeric('offsetY', 0, 10000)}
                  />
                </Field>
              </Section>
            </fieldset>
            <Dependencies key={m.id} milestone={m} project={project} />
            <div className="danger-zone">
              <Button
                title="删除事件（Delete）"
                className="danger"
                disabled={m.locked}
                onClick={() => useEditor.getState().remove()}
              >
                <Trash2 size={14} />
                删除事件
              </Button>
            </div>
          </div>
        ) : (
          <ProjectProperties />
        )}
      </div>
    </aside>
  );
}
