import type { Project } from '../domain/types';
import { uid } from '../domain/defaults';
import {
  newWork,
  type WorkCommand,
  type WorkProposal,
  type WorkTask,
  type WorkLine,
} from '../domain/work';
import { proposal, workNodes, workspace, ngCommands } from './workEngine';
import { today, addDays } from './dateEngine';

export type TemplateKind = 'blank' | 'report' | 'sample' | 'document';
export function createLineCommands(
  title: string,
  stage: WorkTask['stage'],
  template: TemplateKind,
  date = today(),
): WorkCommand[] {
  const line: WorkLine = {
    id: uid(),
    title,
    kind: 'main',
    parentId: '',
    attachNodeId: '',
    finalNodeId: '',
    stage,
  };
  const specs: [string, WorkTask['kind'], number[]][] =
    template === 'report'
      ? [
          ['测试方案准备', 'work', []],
          ['方案评审', 'review', [0]],
          ['测试资源预约', 'resource', []],
          ['测试物料齐套', 'material', []],
          ['测试执行', 'test', [1, 2, 3]],
          ['报告编制', 'work', [4]],
          ['报告评审', 'review', [5]],
          ['报告归档', 'archive', [6]],
        ]
      : template === 'sample'
        ? [
            ['打样资料确认', 'work', []],
            ['费用/计划申报', 'declaration', [0]],
            ['物料申请与齐套', 'material', [0]],
            ['打样资源预约', 'resource', []],
            ['打样执行', 'work', [1, 2, 3]],
            ['样品回料验收', 'work', [4]],
          ]
        : template === 'document'
          ? [
              ['资料编制', 'work', []],
              ['组内汇报', 'review', [0]],
              ['取得组内会议纪要', 'gate', [1]],
              ['SEG会议汇报', 'review', [2]],
              ['取得SEG会议纪要', 'gate', [3]],
              ['资料归档', 'archive', [4]],
            ]
          : [];
  const tasks = specs.map(([name, kind]) => ({
    type: 'task' as const,
    id: uid(),
    title: `${title} · ${name}`,
    date,
    work: { ...newWork(line.id), stage, kind, recurringWeekday: name === 'SEG会议汇报' ? 4 : null },
  }));
  line.finalNodeId = tasks.at(-1)?.id ?? '';
  const commands: WorkCommand[] = [{ type: 'line', line }, ...tasks];
  specs.forEach(([, , previous], i) =>
    previous.forEach((index) =>
      commands.push({
        type: 'dependency',
        edge: {
          id: uid(),
          from: tasks[index].id,
          to: tasks[i].id,
          hard: true,
          condition:
            specs[index][1] === 'review'
              ? 'passed'
              : specs[index][1] === 'resource'
                ? 'confirmed'
                : specs[index][1] === 'material'
                  ? 'ready'
                  : 'done',
        },
      }),
    ),
  );
  return commands;
}
function targetNodes(p: Project, text: string, selectedId: string | null) {
  const nodes = workNodes(p);
  const mentioned = nodes.filter((n) => text.includes(n.title));
  if (mentioned.length) {
    const longest = Math.max(...mentioned.map((n) => n.title.length));
    return mentioned.filter((n) => n.title.length === longest);
  }
  const selected = nodes.find((n) => n.id === selectedId);
  return selected &&
    /^(这个|这项|它|已|完成|搞了|写了|做到|进度|还剩|卡在|物料|资源|测试|下周|不急)/.test(
      text.trim(),
    )
    ? [selected]
    : [];
}
export function parseReport(
  p: Project,
  text: string,
  selectedId: string | null = null,
): WorkProposal {
  const raw = text.trim();
  const commands: WorkCommand[] = [];
  const questions: string[] = [];
  const targets = targetNodes(p, raw, selectedId);
  if (targets.length > 1) {
    const draft = proposal(p, [], raw, 'assistant');
    draft.questions = [
      `存在同名节点，请先选中具体节点：${targets.map((n) => `${workspace(p).lines.find((l) => l.id === n.work.lineId)?.title ?? '独立'} / ${n.title}`).join('；')}`,
    ];
    return draft;
  }
  const node = targets[0];
  if (node) {
    const patch: Partial<WorkTask> = {};
    const pct = raw.match(/(?:完成|搞了|写了|进度|做到|做了)?\s*(\d{1,3})\s*[%％]/);
    if (pct && Number(pct[1]) <= 100) {
      patch.progress = Number(pct[1]);
      patch.estimated = false;
    } else if (/(一大半|大部分)/.test(raw)) {
      patch.progress = 65;
      patch.estimated = true;
      questions.push('进度暂估65%（粗略范围55%～75%），可按实际剩余工作修正。');
    } else if (/一半/.test(raw)) {
      patch.progress = 50;
      patch.estimated = true;
    } else if (/(差不多|基本)(完成|写完|好了)/.test(raw)) {
      patch.progress = 85;
      patch.estimated = true;
      questions.push('接近完成暂估85%，不代表验收通过。');
    } else if (/(一部分|一些)/.test(raw)) {
      patch.progress = 30;
      patch.estimated = true;
      questions.push('“一部分”暂按较宽范围理解，进度粗估30%，需要时可直接修正。');
    }
    const remaining = raw.match(/(?:还剩|剩下|还有|还差|待完成)([^。；\n]+)/);
    if (remaining) patch.remaining = remaining[1].trim();
    const blocker = raw.match(/(?:卡在|受阻于|因为)([^。；\n]+)/);
    if (blocker) patch.blocker = blocker[1].trim();
    else if (/物料.*(?:没回|未回|不足|不够)/.test(raw)) patch.blocker = '物料未齐套';
    else if (/资源.*(?:没约|未约|约不上)/.test(raw)) patch.blocker = '资源尚未确认';
    const shift = raw.match(/(?:往后|后挪|后移|延期|推迟).*?([一二三四五六七八九十\d]+)天/);
    const explicitDate = raw.match(/(?:截止|改到|延期到).*?(\d{4}-\d{2}-\d{2})/);
    if (explicitDate) {
      patch.due = explicitDate[1];
      patch.baselineDue = node.work.baselineDue || node.work.due || explicitDate[1];
    } else if (shift) {
      const num = Number(shift[1]) || '一二三四五六七八九十'.indexOf(shift[1]) + 1;
      if (node.work.due) {
        patch.due = addDays(node.work.due, num);
        patch.baselineDue = node.work.baselineDue || node.work.due;
        questions.push('按自然日后移，仅改当前节点；后继承诺和外部窗口不变。');
      } else questions.push('该节点还没有截止日期，请补充明确日期后再改期。');
    } else if (/(下周再说|不急|往后放)/.test(raw)) {
      patch.priority = 'P3';
      questions.push(
        '仅提出降低优先级，不改截止。尚未验证可延期范围，请查看今日列表中的依赖风险。',
      );
    }
    if ((shift || explicitDate) && !blocker)
      questions.push('本次延期原因尚未填写，可在确认前补充或作为未知保留。');
    if (/(?:测试|回归).*NG|测试失败/i.test(raw)) {
      if (node.work.kind !== 'test')
        questions.push('当前节点不是测试，请选中具体测试节点再登记NG。');
      else {
        const cause = raw.match(/(?:根因可能是|怀疑是)([^，。；]+)/)?.[1] ?? '';
        commands.push(...ngCommands(p, node.id, `${node.title}异常`, cause));
      }
    } else if (
      /(?:已经|今天)?(?:完成了?|写完了?|做完了?)/.test(raw) &&
      !/(没完成|未完成|还没|没搞完|没做完|一部分|一大半|[%％])/.test(raw)
    ) {
      patch.status = 'done';
      patch.progress = 100;
      patch.estimated = false;
      if (node.work.kind === 'test')
        questions.push('仅登记本次执行完成，不推断测试通过，也不关闭NG。');
    }
    if (/已经申报|已申报|已经提交/.test(raw)) patch.condition = 'submitted';
    if (/评审通过/.test(raw)) patch.condition = 'passed';
    if (/预约.*确认|已约上/.test(raw)) patch.condition = 'confirmed';
    if (/物料.*(?:全部到齐|已齐套)/.test(raw)) patch.condition = 'ready';
    if (Object.keys(patch).length) commands.unshift({ type: 'update', id: node.id, patch });
  }
  // Domain-specific extraction is deliberately limited to explicit phrases. Other reports
  // remain editable notes or unresolved items rather than invented workflow facts.
  if (!node && /工艺规程/.test(raw) && /汇报材料.*(?:撰写|写完)|完成了.*汇报材料/.test(raw)) {
    const existing = workspace(p).lines.find((l) => l.title === '工艺规程');
    if (existing) questions.push('已有“工艺规程”线，请选中材料撰写节点后重新整理，避免重复建线。');
    else {
      const flow = createLineCommands('工艺规程', '', 'document');
      const first = flow.find(
        (c): c is Extract<WorkCommand, { type: 'task' }> => c.type === 'task',
      );
      if (first && /完成了|已完成|写完/.test(raw)) {
        first.title = '工艺规程 · 评审汇报材料撰写';
        first.work.status = 'done';
        first.work.progress = 100;
      }
      commands.push(...flow);
      questions.push('组内汇报时间、SEG具体场次和纪要取得时间待补；周四仅为重复窗口。');
    }
  }
  if (!node && /振动/.test(raw) && /回归测试完成/.test(raw)) {
    const existing = workspace(p).lines.find((l) => l.title === '振动测试NG闭环');
    if (existing) questions.push('已有振动测试线，请选择本轮回归节点后登记进展。');
    else {
      const line: WorkLine = {
        id: uid(),
        title: '振动测试NG闭环',
        kind: 'branch',
        parentId: '',
        attachNodeId: '',
        finalNodeId: '',
        stage: '',
      };
      const titles = [
        '本轮振动回归执行',
        '检视样机与测试结果',
        '充放电及测试确认',
        '报告/结果更新',
      ];
      const tasks = titles.map((title, i) => ({
        type: 'task' as const,
        id: uid(),
        title,
        date: today(),
        work: {
          ...newWork(line.id),
          kind: i === 0 || i === 2 ? ('test' as const) : ('work' as const),
          status: i === 0 ? ('done' as const) : ('todo' as const),
          progress: i === 0 ? 100 : null,
          notes: i === 2 ? '仅样机检视无问题后推进；确认是否还有额外测试' : '',
        },
      }));
      line.finalNodeId = tasks.at(-1)!.id;
      commands.push({ type: 'line', line }, ...tasks);
      tasks.slice(1).forEach((t, i) =>
        commands.push({
          type: 'dependency',
          edge: {
            id: uid(),
            from: tasks[i].id,
            to: t.id,
            hard: true,
            condition: i === 1 ? 'passed' : 'done',
          },
        }),
      );
      commands.push({
        type: 'issue',
        issue: {
          id: uid(),
          testId: tasks[0].id,
          title: '振动测试NG',
          suspectedCause: '',
          confirmedCause: '',
          affectedIds: [],
          status: 'open',
          rounds: [{ number: 1, taskIds: tasks.slice(1).map((t) => t.id), result: 'pending' }],
        },
      });
      questions.push(
        '充放电通过即可闭环，还是充放电后还需其他测试？本草案保留“测试确认”，不自动放行。',
      );
    }
  }
  if (!node && /物料/.test(raw) && /入库/.test(raw)) {
    const existing = workspace(p).lines.find((l) => l.title === '打样物料协调');
    if (existing) questions.push('已有打样物料线，请选中缺料或送厂节点更新，避免重复。');
    else {
      const line: WorkLine = {
        id: uid(),
        title: '打样物料协调',
        kind: 'branch',
        parentId: '',
        attachNodeId: '',
        finalNodeId: '',
        stage: '',
      };
      const specs: [string, WorkTask['kind']][] = [
        ['核对物料入库', 'work'],
        ['紧急计划外物料申报', 'declaration'],
        ['缺料协调及到位确认', 'material'],
        ['联系各领域安排送厂', 'work'],
        ['其余物料送达打样厂', 'material'],
        ['打样物料齐套确认', 'gate'],
      ];
      const tasks = specs.map(([title, kind], i) => ({
        type: 'task' as const,
        id: uid(),
        title,
        date: today(),
        work: {
          ...newWork(line.id),
          kind,
          status: i === 0 ? ('done' as const) : ('todo' as const),
          progress: i === 0 ? 100 : null,
          notes: i === 1 ? '缺料名称、数量待补' : i === 3 ? '各领域联系人及送厂截止待补' : '',
        },
      }));
      line.finalNodeId = tasks.at(-1)!.id;
      commands.push({ type: 'line', line }, ...tasks);
      [
        [0, 1],
        [1, 2],
        [0, 3],
        [3, 4],
        [2, 5],
        [4, 5],
      ].forEach(([a, b]) =>
        commands.push({
          type: 'dependency',
          edge: {
            id: uid(),
            from: tasks[a].id,
            to: tasks[b].id,
            hard: true,
            condition: specs[a][1] === 'material' ? 'ready' : 'done',
          },
        }),
      );
      questions.push('请补缺料名称/数量、送厂日期与负责领域；其余物料不视为已齐套。');
    }
  }
  if (!commands.length && node) {
    commands.push({
      type: 'update',
      id: node.id,
      patch: { notes: [node.work.notes, raw].filter(Boolean).join('\n') },
    });
    questions.push('暂不能可靠识别正式状态变化，先按工作备注整理。');
  }
  const draft = proposal(p, commands, raw, 'assistant');
  draft.questions = questions;
  draft.evidence = workspace(p)
    .memories.filter(
      (m) =>
        m.verified &&
        [m.tags, m.content].some((s) =>
          s.split(/[，,、\s]+/).some((word) => word.length >= 2 && raw.includes(word)),
        ),
    )
    .slice(0, 5)
    .map((m) => `${m.content}（来源：${m.source || '用户确认'}）`);
  if (!commands.length && !questions.length)
    draft.questions.push(
      '本地规则暂不能定位这段话。请先选中节点，或将需求记入待解决事项；接入内部API后可进一步解析。',
    );
  return draft;
}

export function parseModelResponse(p: Project, content: string, raw: string): WorkProposal {
  const data = JSON.parse(content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')) as {
    updates?: {
      nodeId: string;
      progress?: number;
      estimated?: boolean;
      remaining?: string;
      blocker?: string;
      status?: string;
      due?: string;
    }[];
    questions?: string[];
  };
  if (!Array.isArray(data.updates))
    throw new Error('模型没有返回可识别的updates；请记录为待解决事项');
  const commands: WorkCommand[] = data.updates.map((update) => {
    const node = workNodes(p).find((n) => n.id === update.nodeId);
    if (!node) throw new Error('模型引用了不存在的节点，未执行');
    const patch: Partial<WorkTask> = {};
    if (update.progress !== undefined) {
      if (typeof update.progress !== 'number' || update.progress < 0 || update.progress > 100)
        throw new Error('模型进度不合法');
      patch.progress = update.progress;
      patch.estimated = update.estimated !== false;
    }
    for (const key of ['remaining', 'blocker', 'due'] as const)
      if (update[key] !== undefined) {
        if (typeof update[key] !== 'string') throw new Error('模型字段格式错误');
        patch[key] = update[key];
      }
    if (update.status !== undefined) {
      if (!['todo', 'doing', 'done', 'cancelled'].includes(update.status))
        throw new Error('模型状态不合法');
      patch.status = update.status as WorkTask['status'];
      if (patch.status === 'done') {
        if (patch.progress !== undefined && patch.progress !== 100)
          throw new Error('模型同时给出完成状态和未完成进度，未执行，请澄清');
        patch.progress = 100;
        patch.estimated = false;
      }
    }
    return { type: 'update', id: node.id, patch };
  });
  const draft = proposal(p, commands, raw, 'assistant');
  // Model-derived writes always require a preview even when their fields are low risk.
  if (draft.level === 'L1') draft.level = 'L2';
  draft.questions = Array.isArray(data.questions)
    ? data.questions.filter((q) => typeof q === 'string')
    : [];
  return draft;
}
