import { useState } from 'react';
import type { Milestone, Project } from '../../domain/types';
import {
  taskKinds,
  taskStatuses,
  type WorkTask,
  type WorkCommand,
  type WorkProposal,
} from '../../domain/work';
import {
  blockers,
  workspace,
  workNodes,
  proposal,
  ngCommands,
  descendants,
} from '../../engine/workEngine';
import { uid } from '../../domain/defaults';
import { Button, Field } from '../common/Controls';
import { useDraftGuard } from '../../hooks/useDraftGuard';

export function TaskDetail({
  node,
  project,
  propose,
  onTimeline,
}: {
  node: Milestone & { work: WorkTask };
  project: Project;
  propose: (p: WorkProposal) => void;
  onTimeline: () => void;
}) {
  const [form, setForm] = useState(node.work);
  const [title, setTitle] = useState(node.title);
  const [reason, setReason] = useState('');
  const [predecessor, setPredecessor] = useState('');
  const [hard, setHard] = useState(true);
  const [condition, setCondition] = useState<'done' | 'passed' | 'confirmed' | 'ready'>('done');
  const [ngTitle, setNgTitle] = useState('');
  const [cause, setCause] = useState('');
  const guard = useDraftGuard();
  const [confirmedCauses, setConfirmedCauses] = useState<Record<string, string>>({});
  const w = workspace(project);
  const problems = blockers(project, node.id);
  const impact = descendants(project, node.id);
  const change = (patch: Partial<WorkTask>) => {
    setForm({ ...form, ...patch });
    guard(true);
  };
  const submit = () => {
    const patch = Object.fromEntries(
      Object.entries(form).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(node.work[key as keyof WorkTask]),
      ),
    ) as Partial<WorkTask>;
    if (patch.due && !node.work.baselineDue) patch.baselineDue = node.work.due || patch.due;
    if (patch.status === 'done') {
      patch.progress = 100;
      patch.estimated = false;
    }
    if (patch.due !== undefined && !reason.trim()) {
      setReason('请填写改期原因后再预览');
      return;
    }
    if (patch.due !== undefined)
      patch.notes = [form.notes, `改期原因：${reason}`].filter(Boolean).join('\n');
    if (Object.keys(patch).length || title !== node.title) {
      propose(
        proposal(
          project,
          [{ type: 'update', id: node.id, patch, ...(title !== node.title ? { title } : {}) }],
          reason || `编辑：${node.title}`,
        ),
      );
      guard(false);
    }
  };
  const issueList = w.issues.filter(
    (i) =>
      i.testId === node.id ||
      i.affectedIds.includes(node.id) ||
      i.rounds.some((r) => r.taskIds.includes(node.id)),
  );
  return (
    <aside className="work-detail" aria-label="任务详情">
      <div className="work-section-heading">
        <strong>节点详情</strong>
        <Button onClick={onTimeline}>在时间线查看 ↗</Button>
      </div>
      {node.locked && <p className="work-warning">此事件已锁定，请到时间线解锁后编辑。</p>}
      <fieldset disabled={node.locked} className="work-fields">
        <Field label="任务标题" wide>
          <input
            aria-label="任务标题"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              guard(true);
            }}
          />
        </Field>
        <div className="work-two">
          <Field label="所属任务线">
            <select value={form.lineId} onChange={(e) => change({ lineId: e.target.value })}>
              <option value="">独立任务</option>
              {w.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="TR阶段">
            <select
              value={form.stage}
              onChange={(e) => change({ stage: e.target.value as WorkTask['stage'] })}
            >
              {['', 'TR3', 'TR4', 'TR5', 'TR6'].map((s) => (
                <option key={s} value={s}>
                  {s || '未指定'}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="work-two">
          <Field label="节点类型">
            <select
              value={form.kind}
              onChange={(e) => change({ kind: e.target.value as WorkTask['kind'] })}
            >
              {Object.entries(taskKinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="执行状态">
            <select
              aria-label="任务执行状态"
              value={form.status}
              onChange={(e) => change({ status: e.target.value as WorkTask['status'] })}
            >
              {Object.entries(taskStatuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="work-two">
          <Field label="进度（留空表示未知）">
            <input
              aria-label="任务进度"
              type="number"
              min="0"
              max="100"
              value={form.progress ?? ''}
              onChange={(e) =>
                change({
                  progress: e.target.value === '' ? null : Number(e.target.value),
                  estimated: false,
                })
              }
            />
          </Field>
          <Field label="优先级">
            <select
              value={form.priority}
              onChange={(e) => change({ priority: e.target.value as WorkTask['priority'] })}
            >
              {['P0', 'P1', 'P2', 'P3'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        {form.estimated && <p className="work-muted">当前进度为估算，可按实际剩余内容修正。</p>}
        <Field label="剩余工作">
          <textarea
            rows={2}
            value={form.remaining}
            onChange={(e) => change({ remaining: e.target.value })}
          />
        </Field>
        <Field label="当前卡点">
          <input value={form.blocker} onChange={(e) => change({ blocker: e.target.value })} />
        </Field>
        <div className="work-two">
          <Field label="截止日期">
            <input
              aria-label="任务截止日期"
              type="date"
              value={form.due}
              onChange={(e) => change({ due: e.target.value })}
            />
          </Field>
          <Field label="截止性质">
            <select
              value={form.deadline}
              onChange={(e) => change({ deadline: e.target.value as WorkTask['deadline'] })}
            >
              <option value="personal">个人安排</option>
              <option value="commitment">对外承诺</option>
            </select>
          </Field>
        </div>
        {form.due !== node.work.due && (
          <Field label="改期原因">
            <input
              aria-label="改期原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {node.work.baselineDue && (
          <p className="work-muted">原始截止：{node.work.baselineDue}（不随改期覆盖）</p>
        )}
        <div className="work-two">
          <Field label="预计总工时">
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.estimateHours ?? ''}
              onChange={(e) =>
                change({ estimateHours: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="剩余工时">
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.remainingHours ?? ''}
              onChange={(e) =>
                change({ remainingHours: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <details open={form.kind !== 'work'}>
          <summary>评审 / 资源 / 物料 / 交付条件</summary>
          <Field label="业务结果">
            <select
              aria-label="任务业务结果"
              value={form.condition}
              onChange={(e) => change({ condition: e.target.value as WorkTask['condition'] })}
            >
              {Object.entries({
                pending: '待处理',
                submitted: '已提交',
                confirmed: '已确认预约',
                passed: '已通过',
                partial: '部分到料',
                ready: '已齐套',
                archived: '已归档',
                failed: '未通过',
              }).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="评审组织 / 资源 / 对接领域">
            <input
              value={form.organization}
              onChange={(e) => change({ organization: e.target.value })}
            />
          </Field>
          <Field label="申报/预约窗口截止">
            <input
              type="datetime-local"
              value={form.window}
              onChange={(e) => change({ window: e.target.value })}
            />
          </Field>
          <Field label="每周会议窗口">
            <select
              value={form.recurringWeekday ?? ''}
              onChange={(e) =>
                change({ recurringWeekday: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">无固定每周窗口</option>
              {['日', '一', '二', '三', '四', '五', '六'].map((v, i) => (
                <option key={i} value={i}>
                  周{v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="物料名称 / 需求与实到数量">
            <input
              value={form.quantity}
              onChange={(e) => change({ quantity: e.target.value })}
              placeholder="例如：样机需2台，实到1台"
            />
          </Field>
          <Field label="材料/纪要/归档路径">
            <input value={form.artifact} onChange={(e) => change({ artifact: e.target.value })} />
          </Field>
          <Field label="材料版本">
            <input
              value={form.artifactVersion}
              onChange={(e) => change({ artifactVersion: e.target.value })}
            />
          </Field>
        </details>
        <Field label="工作备注">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </Field>
        <Button className="primary" onClick={submit}>
          预览节点变更
        </Button>
      </fieldset>
      <section className="work-subsection">
        <h3>前置与影响</h3>
        {problems.map((v, i) => (
          <p className="work-warning" key={i}>
            {v}
          </p>
        ))}
        {!problems.length && (
          <p className="work-muted">
            没有尚未满足的强前置。{impact.length ? `可影响${impact.length}个后继。` : ''}
          </p>
        )}
        {w.dependencies
          .filter((e) => e.to === node.id)
          .map((e) => (
            <div className="work-edge" key={e.id}>
              <span>
                {e.hard ? '强' : '弱'} · {project.milestones.find((n) => n.id === e.from)?.title}
              </span>
              <Button
                onClick={() =>
                  propose(
                    proposal(project, [{ type: 'removeDependency', id: e.id }], '移除前置依赖'),
                  )
                }
              >
                移除
              </Button>
            </div>
          ))}
        <select
          aria-label="新增前置节点"
          value={predecessor}
          onChange={(e) => setPredecessor(e.target.value)}
        >
          <option value="">选择前置节点</option>
          {workNodes(project)
            .filter((n) => n.id !== node.id)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
        </select>
        <div className="work-two">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as typeof condition)}
          >
            <option value="done">完成后</option>
            <option value="passed">评审/检视通过后</option>
            <option value="confirmed">预约确认后</option>
            <option value="ready">物料齐套后</option>
          </select>
          <select value={String(hard)} onChange={(e) => setHard(e.target.value === 'true')}>
            <option value="true">强依赖</option>
            <option value="false">仅提醒</option>
          </select>
        </div>
        <Button
          disabled={!predecessor}
          onClick={() =>
            propose(
              proposal(
                project,
                [
                  {
                    type: 'dependency',
                    edge: { id: uid(), from: predecessor, to: node.id, hard, condition },
                  },
                ],
                '增加前置依赖',
              ),
            )
          }
        >
          预览依赖变更
        </Button>
      </section>
      {node.work.kind === 'test' && (
        <section className="work-subsection">
          <h3>登记测试NG</h3>
          <input
            placeholder="异常现象 / 标题"
            aria-label="NG现象"
            value={ngTitle}
            onChange={(e) => setNgTitle(e.target.value)}
          />
          <input
            placeholder="疑似根因（可留空）"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
          />
          <Button
            disabled={!ngTitle.trim()}
            onClick={() =>
              propose(
                proposal(
                  project,
                  ngCommands(project, node.id, ngTitle, cause),
                  '登记NG，生成定位→整改→回归→报告更新',
                ),
              )
            }
          >
            预览NG闭环
          </Button>
        </section>
      )}
      {issueList.map((issue) => (
        <section className="work-subsection" key={issue.id}>
          <h3>
            {issue.title} · {issue.status === 'open' ? '未关闭' : '已关闭'}
          </h3>
          <p>
            疑似根因：{issue.suspectedCause || '未知'}；确认根因：{issue.confirmedCause || '未知'}
          </p>
          <input
            placeholder="填写已确认根因（应有实际证据）"
            value={confirmedCauses[issue.id] ?? issue.confirmedCause}
            onChange={(e) => setConfirmedCauses({ ...confirmedCauses, [issue.id]: e.target.value })}
          />
          <Button
            onClick={() =>
              propose(
                proposal(
                  project,
                  [
                    {
                      type: 'issue',
                      issue: {
                        ...issue,
                        confirmedCause: confirmedCauses[issue.id] ?? issue.confirmedCause,
                      },
                    },
                  ],
                  '登记已确认根因',
                ),
              )
            }
          >
            登记确认根因
          </Button>
          <p className="work-muted">
            放行范围：
            {issue.affectedIds
              .map((id) => project.milestones.find((n) => n.id === id)?.title)
              .join('、') || '尚未指定，请关联受影响交付节点'}
          </p>
          <select
            aria-label="异常影响范围"
            value=""
            onChange={(e) => {
              if (e.target.value)
                propose(
                  proposal(
                    project,
                    [
                      {
                        type: 'issue',
                        issue: {
                          ...issue,
                          affectedIds: [...new Set([...issue.affectedIds, e.target.value])],
                        },
                      },
                    ],
                    '增加NG影响范围',
                  ),
                );
            }}
          >
            <option value="">增加受阻塞的交付节点</option>
            {workNodes(project)
              .filter(
                (n) =>
                  !issue.rounds.some((r) => r.taskIds.includes(n.id)) &&
                  !issue.affectedIds.includes(n.id) &&
                  n.id !== issue.testId,
              )
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
          </select>
          {issue.rounds.map((r) => (
            <div key={r.number}>
              <strong>
                第{r.number}轮 ·{' '}
                {r.result === 'pending'
                  ? '结果待定'
                  : r.result === 'passed'
                    ? '回归通过'
                    : '回归失败'}
              </strong>
              <ul>
                {r.taskIds.map((id) => (
                  <li key={id}>
                    {project.milestones.find((n) => n.id === id)?.title} ·{' '}
                    {
                      taskStatuses[
                        project.milestones.find((n) => n.id === id)?.work?.status ?? 'todo'
                      ]
                    }
                  </li>
                ))}
              </ul>
              {issue.status === 'open' && r.number === issue.rounds.at(-1)?.number && (
                <div className="work-actions">
                  {(['passed', 'failed'] as const).map((result) => (
                    <Button
                      key={result}
                      onClick={() => {
                        const regressionId = r.taskIds.length === 4 ? r.taskIds[2] : r.taskIds[1];
                        const test = project.milestones.find((n) => n.id === regressionId);
                        const cmds: WorkCommand[] = [
                          {
                            type: 'issue',
                            issue: {
                              ...issue,
                              rounds: issue.rounds.map((round) =>
                                round.number === r.number ? { ...round, result } : round,
                              ),
                            },
                          },
                        ];
                        if (test?.work && result === 'passed')
                          cmds.unshift({
                            type: 'update',
                            id: test.id,
                            patch: { condition: 'passed' },
                          });
                        propose(
                          proposal(
                            project,
                            cmds,
                            `登记第${r.number}轮回归${result === 'passed' ? '通过' : '失败'}`,
                          ),
                        );
                      }}
                    >
                      登记回归{result === 'passed' ? '通过' : '失败'}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {issue.status === 'open' && (
            <div className="work-actions">
              <Button
                disabled={issue.rounds.at(-1)?.result !== 'failed'}
                onClick={() =>
                  propose(
                    proposal(
                      project,
                      ngCommands(project, issue.testId, issue.title, '', issue.id),
                      '回归失败，新增返工轮次',
                    ),
                  )
                }
              >
                新增返工轮次
              </Button>
              <Button
                onClick={() =>
                  propose(proposal(project, [{ type: 'closeIssue', id: issue.id }], '关闭测试NG'))
                }
              >
                预览闭环关闭
              </Button>
            </div>
          )}
        </section>
      ))}
      <section className="work-subsection">
        <h3>最近操作</h3>
        {w.audits
          .filter(
            (a) =>
              a.before.nodes.some((n) => n.id === node.id) ||
              a.after.nodes.some((n) => n.id === node.id),
          )
          .slice(-4)
          .reverse()
          .map((a) => (
            <p key={a.id}>
              {new Date(a.at).toLocaleString()} · {a.reason}
            </p>
          ))}
      </section>
    </aside>
  );
}
