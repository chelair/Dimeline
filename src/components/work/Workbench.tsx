import { useState } from 'react';
import { useEditor } from '../../store/editorStore';
import { uid } from '../../domain/defaults';
import {
  newWork,
  taskKinds,
  taskStatuses,
  type WorkProposal,
  type WorkTask,
} from '../../domain/work';
import {
  applyCommands,
  dailyPlan,
  executeProposal,
  proposal,
  revertAudit,
  workspace,
  workNodes,
  workRevision,
  blockers,
  auditRevision,
} from '../../engine/workEngine';
import {
  createLineCommands,
  parseReport,
  parseModelResponse,
  type TemplateKind,
} from '../../engine/reportEngine';
import { today } from '../../engine/dateEngine';
import { Button, Field } from '../common/Controls';
import { TaskDetail } from './TaskDetail';
import { WorkGraph } from './WorkGraph';

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Workbench({ onTimeline }: { onTimeline: () => void }) {
  const s = useEditor();
  const p = s.project;
  const w = workspace(p);
  const nodes = workNodes(p);
  const [tab, setTab] = useState<'graph' | 'today' | 'records'>('graph');
  const [lineId, setLineId] = useState('');
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'list' | 'graph'>('graph');
  const draft = w.pendingProposal ?? null;
  const setDraft = (next: WorkProposal | null) => useEditor.getState().setProposalDraft(next);
  const [second, setSecond] = useState(false);
  const [error, setError] = useState('');
  const [showAssistant, setShowAssistant] = useState(true);
  const [newLine, setNewLine] = useState(false);
  const [lineTitle, setLineTitle] = useState('');
  const [template, setTemplate] = useState<TemplateKind>('blank');
  const [stage, setStage] = useState<WorkTask['stage']>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [memoryText, setMemoryText] = useState('');
  const [memoryTags, setMemoryTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [api, setApi] = useState({ endpoint: '', model: '', key: '' });
  const [apiStatus, setApiStatus] = useState('');
  const [message, setMessage] = useState('');
  const selected = nodes.find((n) => n.id === s.selectedId);
  const line = w.lines.find((l) => l.id === lineId);
  const visible = nodes.filter(
    (n) =>
      (!lineId || n.work.lineId === lineId) &&
      (!filter ||
        n.work.kind === filter ||
        (filter === 'ng' &&
          w.issues.some(
            (i) =>
              i.status === 'open' &&
              (i.testId === n.id || i.rounds.some((r) => r.taskIds.includes(n.id))),
          ))),
  );
  const notify = (text: string) => useEditor.getState().notify(text);
  const propose = (next: WorkProposal) => {
    setDraft(next);
    setSecond(false);
    setError('');
    setShowAssistant(true);
  };
  const run = (confirmation: 'auto' | 'confirmed' | 'strong') => {
    if (!draft) return;
    const ok = useEditor
      .getState()
      .apply('任务秘书：' + draft.rawText.slice(0, 50), (current) =>
        executeProposal(current, draft, confirmation),
      );
    if (ok) {
      setDraft(null);
      setSecond(false);
      setMessage('已执行，所有视图已同步。可在操作记录中撤销。');
      notify('计划已更新；请保存项目以保留修改');
    }
  };
  const process = () => {
    const text = w.reportDraft.trim();
    if (!text) return;
    if (/^(算了不改了|取消|不改了)$/.test(text)) {
      setDraft(null);
      setSecond(false);
      setMessage('草案已取消，计划未改变。');
      return;
    }
    if (/^(确认执行|确认)$/.test(text) && draft) {
      if (draft.level === 'L3' && !second) {
        setSecond(true);
        setMessage('此操作需要再次核对，请使用下方强确认按钮。');
      } else run(draft.level === 'L3' ? 'strong' : 'confirmed');
      return;
    }
    if (/今天.*(必须|要做|做什么)|今日任务/.test(text)) {
      setTab('today');
      setMessage('今日安排已按截止、窗口、优先级和下游影响生成；不会自动修改日期。');
      return;
    }
    try {
      const next = parseReport(p, text, s.selectedId);
      if (next.level === 'L1' && next.commands.length && w.autoProgress) {
        const ok = useEditor
          .getState()
          .apply('口述进展：' + text.slice(0, 40), (current) =>
            executeProposal(current, next, 'auto'),
          );
        if (ok) {
          setMessage(
            `已记录：${next.diff.join('；')}。${next.questions.join(' ')} 可在记录页撤销。`,
          );
          setDraft(null);
        }
      } else propose(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const recordUnresolved = (reason = '本地规则暂不能处理，需要进一步实现或人工澄清') =>
    propose(
      proposal(
        p,
        [
          {
            type: 'unresolved',
            item: {
              id: uid(),
              text: w.reportDraft,
              reason,
              context: JSON.stringify({
                project: p.title,
                selectedNode: selected?.title,
                line: line?.title,
              }),
              status: 'open',
              createdAt: new Date().toISOString(),
            },
          },
        ],
        '记录待解决事项',
      ),
    );
  const openSettings = async () => {
    setSettings(!settings);
    if (!settings && window.desktop?.getAssistantSettings) {
      const result = await window.desktop.getAssistantSettings();
      setApi({ endpoint: result.endpoint, model: result.model, key: '' });
      setApiStatus(result.hasKey ? '已保存密钥；留空保留原密钥' : '尚未保存密钥');
    }
  };
  const askModel = async () => {
    if (!window.desktop?.askAssistant) {
      setError('内部API请在桌面应用中配置并使用。');
      return;
    }
    if (!w.reportDraft.trim()) return;
    setBusy(true);
    setError('');
    const base = workRevision(p);
    const raw = w.reportDraft;
    try {
      const context = {
        selectedNodeId: s.selectedId,
        nodes: nodes.map((n) => ({
          id: n.id,
          title: n.title,
          line: w.lines.find((l) => l.id === n.work.lineId)?.title,
          work: n.work,
        })),
        memories: w.memories.filter((m) => m.verified).slice(-5),
      };
      const result = await window.desktop.askAssistant(raw, JSON.stringify(context));
      if (!result.ok) throw new Error(result.error);
      if (workRevision(useEditor.getState().project) !== base)
        throw new Error('等待模型时计划已有变化，请重新整理。');
      propose(parseModelResponse(p, result.value, raw));
    } catch (e) {
      setError((e as Error).message);
      setMessage('未执行模型写操作。可以记录待解决事项，继续使用本地整理或手工编辑。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workbench" data-testid="workbench">
      <aside className="work-sidebar">
        <div className="work-project-label">产品开发 · 本地项目</div>
        <h2>{p.title}</h2>
        <Button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>
          任务线 <span>{nodes.length}</span>
        </Button>
        <Button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          今日安排 <span>{dailyPlan(p).filter((i) => i.category === '今日必做').length}</span>
        </Button>
        <Button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>
          记录与经验 <span>{w.unresolved.filter((i) => i.status === 'open').length || ''}</span>
        </Button>
        <div className="work-sidebar-heading">
          <strong>自由任务线</strong>
          <Button title="创建任务线" onClick={() => setNewLine(!newLine)}>
            ＋
          </Button>
        </div>
        <button
          className={`work-line-link ${!lineId ? 'selected' : ''}`}
          onClick={() => {
            setLineId('');
            setTab('graph');
          }}
        >
          全部任务 / 独立事项
        </button>
        {w.lines.map((l) => (
          <button
            key={l.id}
            className={`work-line-link ${lineId === l.id ? 'selected' : ''}`}
            onClick={() => {
              setLineId(l.id);
              setTab('graph');
            }}
          >
            <span>
              {l.kind === 'branch' ? '↳ ' : ''}
              {l.title}
            </span>
            <small>
              {l.stage || '未分阶段'} ·{' '}
              {nodes.filter((n) => n.work.lineId === l.id && n.work.status === 'done').length}/
              {nodes.filter((n) => n.work.lineId === l.id).length}
            </small>
          </button>
        ))}
        <p className="work-sidebar-note">结构自由，按需补充前置。模板是起点，不是固定流程。</p>
        <Button
          onClick={() => {
            const next = { ...p, workspace: { ...w, autoProgress: !w.autoProgress } };
            s.apply('调整自动记录权限', () => next);
          }}
        >
          明确进展自动记录：{w.autoProgress ? '开' : '关'}
        </Button>
      </aside>
      <main className="work-main">
        <header className="work-heading">
          <div>
            <span className="eyebrow">
              {tab === 'today'
                ? 'TODAY'
                : tab === 'records'
                  ? 'HISTORY & MEMORY'
                  : 'DELIVERY LINES'}
            </span>
            <h1>
              {tab === 'today'
                ? '今天，推进真正重要的事'
                : tab === 'records'
                  ? '留下依据，逐步积累经验'
                  : line?.title || '从准备到交付，让工作收束'}
            </h1>
          </div>
          <Button className="primary" onClick={() => setShowAssistant(!showAssistant)}>
            {showAssistant ? '收起秘书' : '打开秘书'}
          </Button>
        </header>
        {newLine && (
          <section className="work-create">
            <h3>创建自由任务线</h3>
            <div className="work-two">
              <Field label="任务线名称">
                <input
                  aria-label="任务线名称"
                  value={lineTitle}
                  onChange={(e) => setLineTitle(e.target.value)}
                />
              </Field>
              <Field label="初始结构">
                <select
                  aria-label="任务线模板"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as TemplateKind)}
                >
                  <option value="blank">空白，自由搭建</option>
                  <option value="report">测试报告</option>
                  <option value="sample">打样</option>
                  <option value="document">资料评审归档</option>
                </select>
              </Field>
            </div>
            <Field label="阶段">
              <select value={stage} onChange={(e) => setStage(e.target.value as WorkTask['stage'])}>
                {['', 'TR3', 'TR4', 'TR5', 'TR6'].map((v) => (
                  <option key={v} value={v}>
                    {v || '暂不指定'}
                  </option>
                ))}
              </select>
            </Field>
            <div className="work-actions">
              <Button
                disabled={!lineTitle.trim()}
                onClick={() => {
                  propose(
                    proposal(
                      p,
                      createLineCommands(lineTitle.trim(), stage, template),
                      '创建任务线：' + lineTitle,
                    ),
                  );
                  setNewLine(false);
                }}
              >
                预览建线
              </Button>
              <Button onClick={() => setNewLine(false)}>取消</Button>
            </div>
          </section>
        )}
        {tab === 'graph' && (
          <>
            <div className="work-tools">
              <div className="work-actions">
                <Button
                  className={view === 'graph' ? 'active' : ''}
                  onClick={() => setView('graph')}
                >
                  收束图
                </Button>
                <Button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                  节点列表
                </Button>
              </div>
              <select
                aria-label="任务类型筛选"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setView('list');
                }}
              >
                <option value="">全部类型</option>
                {Object.entries(taskKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                <option value="ng">未闭环NG</option>
              </select>
            </div>
            {line && (
              <details className="work-line-settings">
                <summary>任务线设置 · 挂接、阶段与最终节点</summary>
                <div className="work-two">
                  <Field label="主线/支线">
                    <select
                      value={line.kind}
                      onChange={(e) =>
                        propose(
                          proposal(
                            p,
                            [
                              {
                                type: 'line',
                                line: { ...line, kind: e.target.value as typeof line.kind },
                              },
                            ],
                            '调整任务线类型',
                          ),
                        )
                      }
                    >
                      <option value="main">主线</option>
                      <option value="branch">支线</option>
                      <option value="standalone">独立线</option>
                    </select>
                  </Field>
                  <Field label="父任务线">
                    <select
                      value={line.parentId}
                      onChange={(e) =>
                        propose(
                          proposal(
                            p,
                            [{ type: 'line', line: { ...line, parentId: e.target.value } }],
                            '调整父任务线',
                          ),
                        )
                      }
                    >
                      <option value="">独立存在</option>
                      {w.lines
                        .filter((l) => l.id !== line.id)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <Field label="展示挂接节点（不自动增加依赖）">
                  <select
                    value={line.attachNodeId}
                    onChange={(e) =>
                      propose(
                        proposal(
                          p,
                          [{ type: 'line', line: { ...line, attachNodeId: e.target.value } }],
                          '挂接支线',
                        ),
                      )
                    }
                  >
                    <option value="">不挂接</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="最终完成节点">
                  <select
                    value={line.finalNodeId}
                    onChange={(e) =>
                      propose(
                        proposal(
                          p,
                          [{ type: 'line', line: { ...line, finalNodeId: e.target.value } }],
                          '调整最终节点',
                        ),
                      )
                    }
                  >
                    <option value="">暂不指定</option>
                    {nodes
                      .filter((n) => n.work.lineId === line.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                  </select>
                </Field>
              </details>
            )}
            <form
              className="work-add-task"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                const id = uid();
                propose(
                  proposal(
                    p,
                    [
                      {
                        type: 'task',
                        id,
                        title: taskTitle.trim(),
                        date: today(),
                        work: { ...newWork(lineId), stage: line?.stage ?? '' },
                      },
                    ],
                    '新增自由节点',
                  ),
                );
                setTaskTitle('');
              }}
            >
              <input
                aria-label="新任务名称"
                placeholder="添加任务、前置事项或临时杂事…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <Button type="submit" disabled={!taskTitle.trim()}>
                ＋ 添加节点
              </Button>
            </form>
            {!nodes.length ? (
              <div className="work-empty">
                <div className="work-empty-mark">↗</div>
                <h2>先建一条线，也可以先说今天做了什么</h2>
                <p>按产品项目组织工作；TR是骨架，细节由你决定。</p>
                <Button onClick={() => setNewLine(true)}>创建第一条任务线</Button>
                <p>已有时间线事件？选中事件后，可以加入任务管理。</p>
              </div>
            ) : view === 'graph' ? (
              <WorkGraph
                project={p}
                lineId={lineId}
                selectedId={s.selectedId}
                onSelect={(id) => s.select(id)}
              />
            ) : (
              <div className="work-node-list">
                {visible.map((n) => (
                  <button
                    key={n.id}
                    className={`work-node-card ${s.selectedId === n.id ? 'selected' : ''}`}
                    onClick={() => s.select(n.id)}
                  >
                    <span className={`work-status-dot ${n.work.status}`} />
                    <div>
                      <strong>{n.title}</strong>
                      <small>
                        {n.work.stage} · {taskKinds[n.work.kind]} · {taskStatuses[n.work.status]}
                        {blockers(p, n.id).length ? ' · 待前置' : ''}
                      </small>
                      {n.work.remaining && <p>剩余：{n.work.remaining}</p>}
                    </div>
                    <span>
                      {n.work.progress !== null
                        ? `${n.work.estimated ? '约' : ''}${n.work.progress}%`
                        : '未估算'}
                    </span>
                  </button>
                ))}
                {!visible.length && <p className="work-muted">当前筛选下没有节点。</p>}
              </div>
            )}
            {p.milestones.some((n) => !n.work) && (
              <details className="work-subsection">
                <summary>将原时间线事件加入任务管理</summary>
                {p.milestones
                  .filter((n) => !n.work)
                  .map((n) => (
                    <Button
                      key={n.id}
                      onClick={() =>
                        propose(
                          proposal(
                            p,
                            [
                              {
                                type: 'update',
                                id: n.id,
                                patch: {
                                  ...newWork(lineId),
                                  status: n.completed ? 'done' : 'todo',
                                  progress: n.completed ? 100 : null,
                                },
                              },
                            ],
                            `接入已有事件：${n.title}`,
                          ),
                        )
                      }
                    >
                      {n.title} ＋
                    </Button>
                  ))}
              </details>
            )}
          </>
        )}
        {tab === 'today' && (
          <>
            <div className="work-today-info">
              <span>{today()} · 本地规则排序，打开即更新</span>
              <label>
                每日可用工时{' '}
                <input
                  aria-label="每日可用工时"
                  type="number"
                  min="1"
                  max="24"
                  value={w.dailyHours}
                  onChange={(e) => {
                    const hours = Number(e.target.value);
                    if (hours >= 1 && hours <= 24)
                      s.apply('调整每日容量', (current) => ({
                        ...current,
                        workspace: { ...workspace(current), dailyHours: hours },
                      }));
                  }}
                />
              </label>
            </div>
            {['今日必做', '建议推进', '可稍延期', '风险预警'].map((category) => (
              <section className="work-today-group" key={category}>
                <h2>
                  {category}
                  <small>{dailyPlan(p).filter((i) => i.category === category).length}</small>
                </h2>
                {dailyPlan(p)
                  .filter((i) => i.category === category)
                  .map((item) => (
                    <button
                      className="work-today-card"
                      key={item.node.id}
                      onClick={() => s.select(item.node.id)}
                    >
                      <strong>{item.node.title}</strong>
                      <p>{item.reason}</p>
                      {item.memories.map((memory, i) => (
                        <p key={i} className="work-muted">
                          历史提醒：{memory}
                        </p>
                      ))}
                      <small>
                        {item.hours !== null
                          ? `剩余约${Math.round(item.hours * 10) / 10}小时`
                          : '剩余工时未知'}{' '}
                        · {item.confidence} · 查看无需确认，改期需确认
                      </small>
                      {item.risk.length > 0 && (
                        <p className="work-warning">{item.risk.join('；')}</p>
                      )}
                      {item.latestStart && (
                        <p>当前信息下最晚开始：{item.latestStart}；未计入未登记外部约束。</p>
                      )}
                    </button>
                  ))}
              </section>
            ))}
            {!nodes.length && (
              <p className="work-muted">
                建立任务后，这里会根据已登记事实生成安排；不会编造窗口和耗时。
              </p>
            )}
          </>
        )}
        {tab === 'records' && (
          <>
            <section className="work-subsection">
              <h2>待解决事项</h2>
              <p className="work-muted">
                记录模型处理不了的需求。导出前可查看内容，默认不附项目文件、原始文档或密钥。
              </p>
              <Button
                onClick={() =>
                  download(
                    'Dimeline-待解决事项.md',
                    w.unresolved
                      .map(
                        (i) =>
                          `## ${i.status === 'open' ? '待处理' : '已解决'}：${i.reason}\n\n原话：${i.text}\n\n上下文：${i.context}\n`,
                      )
                      .join('\n'),
                  )
                }
              >
                导出待解决事项
              </Button>
              {w.unresolved.map((i) => (
                <article className="work-record" key={i.id}>
                  <strong>
                    {i.reason} · {i.status === 'open' ? '待处理' : '已解决'}
                  </strong>
                  <p>{i.text}</p>
                  <small>{i.context}</small>
                  {i.status === 'open' && (
                    <Button
                      onClick={() =>
                        propose(
                          proposal(p, [{ type: 'resolve', id: i.id }], '标记待解决事项已处理'),
                        )
                      }
                    >
                      已处理
                    </Button>
                  )}
                </article>
              ))}
            </section>
            <section className="work-subsection">
              <h2>经验与规则</h2>
              <p className="work-muted">
                只有明确确认的经验参与提醒；不会自动从一次延期生成公司规则。
              </p>
              <Field label="经验 / 提前提醒">
                <textarea
                  aria-label="经验内容"
                  value={memoryText}
                  onChange={(e) => setMemoryText(e.target.value)}
                />
              </Field>
              <Field label="检索关键词（逗号分隔）">
                <input
                  value={memoryTags}
                  onChange={(e) => setMemoryTags(e.target.value)}
                  placeholder="测试报告,评审,提前申报"
                />
              </Field>
              <Button
                disabled={!memoryText.trim()}
                onClick={() => {
                  propose(
                    proposal(
                      p,
                      [
                        {
                          type: 'memory',
                          memory: {
                            id: uid(),
                            type: 'lesson',
                            content: memoryText.trim(),
                            tags: memoryTags,
                            source: '用户录入确认',
                            verified: true,
                            createdAt: new Date().toISOString(),
                          },
                        },
                      ],
                      '保存个人经验',
                    ),
                  );
                  setMemoryText('');
                }}
              >
                预览保存经验
              </Button>
              {w.memories.map((m) => (
                <article key={m.id} className="work-record">
                  <p>{m.content}</p>
                  <small>
                    {m.verified ? '已确认' : '待验证'} · {m.source} · {m.tags}
                  </small>
                  {!m.verified && (
                    <Button
                      onClick={() =>
                        propose(
                          proposal(
                            p,
                            [{ type: 'memory', memory: { ...m, verified: true } }],
                            '确认延期经验，仅作为相似任务提醒依据',
                          ),
                        )
                      }
                    >
                      确认经验用于提醒
                    </Button>
                  )}
                </article>
              ))}
            </section>
            <section className="work-subsection">
              <h2>操作审计</h2>
              <p className="work-muted">
                记录随项目保存。只能直接撤销未被后续任务修改覆盖的操作；既有记录不会删除。
              </p>
              {w.audits
                .slice()
                .reverse()
                .map((a) => (
                  <article className="work-record" key={a.id}>
                    <strong>{a.reason}</strong>
                    <small>
                      {new Date(a.at).toLocaleString()} ·{' '}
                      {a.source === 'assistant' ? '秘书' : '人工'} · {a.level}
                      {a.reverts ? ' · 撤销记录' : ''}
                    </small>
                    <ul>
                      {a.diff.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                    <Button
                      disabled={auditRevision(p) !== a.afterRevision}
                      onClick={() => {
                        s.apply('撤销任务操作', (current) => revertAudit(current, a.id));
                      }}
                    >
                      撤销此操作
                    </Button>
                  </article>
                ))}
            </section>
          </>
        )}
      </main>
      {selected && (
        <TaskDetail
          key={`${selected.id}:${JSON.stringify(selected.work)}:${selected.title}`}
          node={selected}
          project={p}
          propose={propose}
          onTimeline={onTimeline}
        />
      )}
      {showAssistant && (
        <aside className="work-assistant" aria-label="对话秘书">
          <div className="work-section-heading">
            <div>
              <span className="eyebrow">PERSONAL ASSISTANT</span>
              <h2>说说你的进展</h2>
            </div>
            <Button title="内部API设置" onClick={() => void openSettings()}>
              设置
            </Button>
          </div>
          <p className="work-muted">
            本地整理可直接使用。内部模型仅在点击“内部API整理”后调用，写入前仍需预览。
          </p>
          {selected && <p className="work-context">当前引用：{selected.title}</p>}
          {settings && (
            <section className="work-api-settings">
              <p>
                适用于返回 choices[0].message.content
                的聊天接口。地址填写完整请求URL；其他内部格式可记录待适配。
              </p>
              <Field label="完整API地址">
                <input
                  aria-label="内部API地址"
                  value={api.endpoint}
                  onChange={(e) => setApi({ ...api, endpoint: e.target.value })}
                  placeholder="https://内部地址/…/chat/completions"
                />
              </Field>
              <Field label="模型标识（按内部文档）">
                <input
                  aria-label="内部模型标识"
                  value={api.model}
                  onChange={(e) => setApi({ ...api, model: e.target.value })}
                />
              </Field>
              <Field label="API密钥（仅本机保存）">
                <input
                  aria-label="内部API密钥"
                  type="password"
                  autoComplete="off"
                  value={api.key}
                  onChange={(e) => setApi({ ...api, key: e.target.value })}
                />
              </Field>
              <Button
                onClick={async () => {
                  if (!window.desktop?.saveAssistantSettings) {
                    setApiStatus('请在桌面窗口配置');
                    return;
                  }
                  const result = await window.desktop.saveAssistantSettings(api);
                  setApiStatus(result.ok ? '配置已保存；未自动发送数据' : result.error);
                  setApi({ ...api, key: '' });
                }}
              >
                保存连接配置
              </Button>
              <p>{apiStatus}</p>
            </section>
          )}
          <textarea
            aria-label="口述工作进展"
            rows={7}
            placeholder="例如：选中一个节点，说“写了一大半，还剩结论，卡在评审”"
            value={w.reportDraft}
            onChange={(e) => s.setReportDraft(e.target.value)}
          />
          <div className="work-actions">
            <Button className="primary" onClick={process}>
              本地整理
            </Button>
            <Button disabled={busy} onClick={() => void askModel()}>
              {busy ? '整理中…' : '内部API整理'}
            </Button>
          </div>
          {message && <p className="work-message">{message}</p>}
          {error && (
            <p className="work-warning" role="alert">
              {error}
            </p>
          )}
          {draft && (
            <section className="work-proposal" aria-label="变更预览">
              <div className="work-section-heading">
                <strong>变更预览</strong>
                <span>{draft.level}</span>
              </div>
              <ul>
                {draft.diff.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
              {draft.questions.length > 0 && (
                <div className="work-questions">
                  <strong>待补充 / 解释</strong>
                  {draft.questions.map((q, i) => (
                    <p key={i}>{q}</p>
                  ))}
                </div>
              )}
              {draft.evidence.length > 0 && (
                <details>
                  <summary>参考经验</summary>
                  {draft.evidence.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </details>
              )}
              {draft.commands.length > 0 && (
                <>
                  <p className="work-muted">
                    仅执行以上列出的变更；未填写的条件保持未知。
                    {draft.level === 'L3' ? '此操作涉及关键结果或依赖，需二次确认。' : ''}
                  </p>
                  {second && (
                    <p className="work-warning">
                      请再次核对以上对象、结果和影响。确认后写入，原话及前后值会留存。
                    </p>
                  )}
                  <Button
                    className="primary"
                    onClick={() => {
                      try {
                        applyCommands(p, draft.commands);
                        if (draft.level === 'L3' && !second) {
                          setSecond(true);
                          return;
                        }
                        run(draft.level === 'L3' ? 'strong' : 'confirmed');
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {draft.level === 'L3' ? (second ? '再次确认并执行' : '核对并继续') : '确认执行'}
                  </Button>
                </>
              )}
              <Button
                onClick={() => {
                  setDraft(null);
                  setSecond(false);
                  setMessage('草案已取消，计划未改变。');
                }}
              >
                取消草案
              </Button>
            </section>
          )}
          <Button
            onClick={() => recordUnresolved(error || undefined)}
            disabled={!w.reportDraft.trim()}
          >
            记录为待解决事项
          </Button>
          <p className="work-muted">
            口述草稿、任务、经验和记录均随项目保存。Ctrl+S保存；关闭时有未保存保护。
          </p>
        </aside>
      )}
    </div>
  );
}
