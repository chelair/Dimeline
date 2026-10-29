import { describe, expect, it } from 'vitest';
import { createProject, createMilestone } from '../src/domain/defaults';
import {
  applyCommands,
  blockers,
  executeProposal,
  ngCommands,
  proposal,
  revertAudit,
  workNodes,
  workspace,
  dailyPlan,
} from '../src/engine/workEngine';
import { createLineCommands, parseModelResponse, parseReport } from '../src/engine/reportEngine';
import { deserialize, serialize } from '../src/services/serialization';
import { addDays, today } from '../src/engine/dateEngine';
import type { WorkCommand } from '../src/domain/work';

const example =
  '今天完成了工艺规程的评审汇报材料撰写，待先在组内汇报，然后拿到会议纪要后再在每周四的SEG会议上汇报，汇报过拿到会议纪要就可以归档这个资料了，今天之前振动测试NG的回归测试完成了，我要去检视样机，看下这次测的怎么样，如果没问题再经过一次充放电然后过了这项测试就可以闭环了。今天还去对了下物料入库的情况，物料有xx一项不够，需要再申报紧急计划外物料协调过去，其他的待联系各下层领域，让他们xx日之前给送到打样厂。';
function setup() {
  return applyCommands(createProject(), createLineCommands('测试报告A', 'TR4', 'report'));
}

describe('产品任务规则与对话事务', () => {
  it('接入旧时间线事件后撤销只移除任务信息，保留原事件与样式；撤销记录也可恢复', () => {
    const p = createProject();
    const old = createMilestone(today());
    old.title = '旧事件';
    old.offsetX = 43;
    p.milestones.push(old);
    const source = workNodes(setup())[0].work;
    const draft = proposal(
      p,
      [{ type: 'update', id: old.id, patch: { ...source, lineId: '' } }],
      '接入旧事件',
    );
    const next = executeProposal(p, draft, 'confirmed');
    const restored = revertAudit(next, draft.id);
    expect(restored.milestones).toHaveLength(1);
    expect(restored.milestones[0]).toMatchObject({ title: '旧事件', offsetX: 43 });
    expect(restored.milestones[0].work).toBeUndefined();
    const redone = revertAudit(restored, workspace(restored).audits.at(-1)!.id);
    expect(redone.milestones).toHaveLength(1);
    expect(redone.milestones[0].work).toBeDefined();
  });
  it('口述例子拆为三线，执行完成不等于NG关闭，未知日期和数量不编造，保存重开保留', () => {
    const p = createProject();
    const draft = parseReport(p, example);
    expect(draft.level).toBe('L2');
    const next = executeProposal(p, draft, 'confirmed');
    expect(workspace(next).lines).toHaveLength(3);
    expect(workNodes(next).filter((n) => n.work.status === 'done')).toHaveLength(3);
    expect(workspace(next).issues[0].status).toBe('open');
    expect(workNodes(next).find((n) => n.title.includes('SEG会议汇报'))?.work).toMatchObject({
      recurringWeekday: 4,
      status: 'todo',
      due: '',
    });
    expect(workNodes(next).find((n) => n.title === '其余物料送达打样厂')?.work.condition).toBe(
      'pending',
    );
    expect(deserialize(serialize(next)).project).toEqual(next);
    expect(workspace(next).audits[0].rawText).toBe(example);
    const duplicate = parseReport(next, example);
    expect(duplicate.commands).toHaveLength(0);
  });
  it('强前置和条件汇合不能绕过，弱依赖只提醒，业务图不受日期传播影响', () => {
    const p = setup();
    const nodes = workNodes(p);
    const test = nodes.find((n) => n.work.kind === 'test')!;
    expect(blockers(p, test.id)).toHaveLength(3);
    expect(() =>
      applyCommands(p, [{ type: 'update', id: test.id, patch: { status: 'done', progress: 100 } }]),
    ).toThrow('不能完成');
    const edge = workspace(p).dependencies.find((e) => e.to === test.id)!;
    const relaxed = structuredClone(p);
    relaxed.workspace!.dependencies.find((e) => e.id === edge.id)!.hard = false;
    expect(blockers(relaxed, test.id)).toHaveLength(2);
    expect(() =>
      applyCommands(p, [
        {
          type: 'dependency',
          edge: {
            id: 'cycle',
            from: nodes.at(-1)!.id,
            to: nodes[0].id,
            hard: true,
            condition: 'done',
          },
        },
      ]),
    ).toThrow('循环');
  });
  it('明确进度与估算进度可记录，但不自动改状态或日期；同名先澄清', () => {
    let p = applyCommands(createProject(), createLineCommands('自由线', '', 'blank'));
    const line = workspace(p).lines[0];
    const initial = setup();
    const task = workNodes(initial)[0];
    p = applyCommands(p, [
      {
        type: 'task',
        id: 'A',
        title: '事件A',
        date: today(),
        work: { ...task.work, lineId: line.id, status: 'doing', progress: 20 },
      },
    ]);
    const d = parseReport(p, '事件A今天没搞完，只搞了50%，卡在评审');
    expect(d.level).toBe('L1');
    const next = executeProposal(p, d, 'auto');
    expect(workNodes(next)[0].work).toMatchObject({
      progress: 50,
      status: 'doing',
      due: '',
      condition: 'pending',
      blocker: '评审',
    });
    const estimate = parseReport(next, '事件A写了一大半，还剩结论和异常分析');
    const estimated = executeProposal(next, estimate, 'auto');
    expect(workNodes(estimated)[0].work).toMatchObject({
      progress: 65,
      estimated: true,
      remaining: '结论和异常分析',
    });
    const same = applyCommands(next, [
      {
        type: 'task',
        id: 'B',
        title: '事件A',
        date: today(),
        work: { ...task.work, lineId: line.id },
      },
    ]);
    expect(parseReport(same, '事件A完成了50%').commands).toHaveLength(0);
  });
  it('草案过期、缺确认、关键结果确认不能被模型或调用方绕过，最近操作可持久撤销', () => {
    const p = setup();
    const task = workNodes(p)[0];
    const d = proposal(
      p,
      [{ type: 'update', id: task.id, patch: { due: addDays(today(), 3) } }],
      '改期',
    );
    expect(() => executeProposal(p, d, 'auto')).toThrow('确认');
    const changed = executeProposal(p, d, 'confirmed');
    expect(workspace(changed).audits[0].before.nodes).toHaveLength(1);
    expect(() => executeProposal(changed, d, 'confirmed')).toThrow('变化');
    const restored = revertAudit(deserialize(serialize(changed)).project, d.id);
    expect(workNodes(restored)[0].work.due).toBe('');
    expect(workspace(restored).audits).toHaveLength(2);
    const review = workNodes(p).find((n) => n.work.kind === 'review')!;
    const high = proposal(
      p,
      [{ type: 'update', id: review.id, patch: { condition: 'passed' } }],
      '评审通过',
    );
    expect(high.level).toBe('L3');
    expect(() => executeProposal(p, high, 'confirmed')).toThrow('确认');
    const model = parseModelResponse(
      p,
      JSON.stringify({ updates: [{ nodeId: task.id, progress: 30 }] }),
      '写了一部分',
    );
    expect(() => executeProposal(p, model, 'auto')).toThrow('确认');
  });
  it('NG重复失败按轮次展开，独立异常并行，只有末轮回归通过和全部任务完成才闭环', () => {
    let p = setup();
    const test = workNodes(p).find((n) => n.work.kind === 'test')!;
    p = applyCommands(p, ngCommands(p, test.id, '电源异常', '电源'));
    p = applyCommands(p, ngCommands(p, test.id, '通信异常'));
    const first = workspace(p).issues[0];
    expect(workspace(p).issues).toHaveLength(2);
    expect(first.confirmedCause).toBe('');
    expect(() => applyCommands(p, [{ type: 'closeIssue', id: first.id }])).toThrow('回归通过');
    p = applyCommands(p, [
      {
        type: 'issue',
        issue: { ...first, rounds: first.rounds.map((r) => ({ ...r, result: 'failed' })) },
      },
    ]);
    p = applyCommands(p, ngCommands(p, test.id, '电源异常', '', first.id));
    expect(workspace(p).issues[0].rounds).toHaveLength(2);
    let issue = workspace(p).issues[0];
    const commands: WorkCommand[] = issue.rounds
      .at(-1)!
      .taskIds.map((id) => ({ type: 'update', id, patch: { status: 'done', progress: 100 } }));
    issue = {
      ...issue,
      rounds: issue.rounds.map((r, i) => (i === 1 ? { ...r, result: 'passed' } : r)),
    };
    p = applyCommands(p, [
      ...commands,
      { type: 'issue', issue },
      { type: 'closeIssue', id: first.id },
    ]);
    expect(workspace(p).issues[0].status).toBe('closed');
    expect(workspace(p).issues[1].status).toBe('open');
  });
  it('有窗口、外部承诺或未知工时不建议延期，单点改期不偷偷移动后继', () => {
    let p = setup();
    const n = workNodes(p).at(-1)!;
    p = applyCommands(p, [
      { type: 'update', id: n.id, patch: { due: addDays(today(), 10), remainingHours: 2 } },
    ]);
    const one = dailyPlan(p).find((i) => i.node.id === n.id)!;
    expect(one.category).toBe('风险预警');
    const d = parseReport(p, `${n.title}截止往后挪三天，因为物料没回`);
    expect(d.commands.filter((c) => c.type === 'update')).toHaveLength(1);
    expect(d.commands.some((c) => c.type === 'memory' && !c.memory.verified)).toBe(true);
    const updated = executeProposal(p, d, 'confirmed');
    expect(workNodes(updated).at(-1)!.work.due).toBe(addDays(today(), 13));
    expect(workNodes(updated)[0].work.due).toBe('');
  });
});
