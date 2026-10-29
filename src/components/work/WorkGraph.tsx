import type { Project } from '../../domain/types';
import { blockers, topologicalWork, workspace, workNodes } from '../../engine/workEngine';
import { taskKinds } from '../../domain/work';

export function WorkGraph({
  project,
  lineId,
  selectedId,
  onSelect,
}: {
  project: Project;
  lineId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const w = workspace(project);
  const all = workNodes(project);
  const nodes = all.filter((n) => !lineId || n.work.lineId === lineId);
  const order = topologicalWork(project);
  const depth = new Map<string, number>();
  for (const id of order)
    depth.set(
      id,
      Math.max(
        0,
        ...w.dependencies.filter((e) => e.to === id).map((e) => (depth.get(e.from) ?? 0) + 1),
      ),
    );
  const slots = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const row = slots.get(d) ?? 0;
    slots.set(d, row + 1);
    pos.set(n.id, { x: 36 + d * 242, y: 44 + row * 126 });
  }
  const width = Math.max(760, ...[...pos.values()].map((p) => p.x + 240));
  const height = Math.max(360, ...[...pos.values()].map((p) => p.y + 130));
  return (
    <div className="work-graph-scroll">
      <svg
        className="work-graph"
        width={width}
        height={height}
        aria-label="鱼骨收束任务图"
        role="img"
      >
        <defs>
          <marker id="work-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="none" stroke="currentColor" />
          </marker>
        </defs>
        {w.dependencies
          .filter((e) => pos.has(e.from) && pos.has(e.to))
          .map((e) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return (
              <path
                key={e.id}
                d={`M${a.x + 206},${a.y + 43} H${a.x + 222} V${b.y + 43} H${b.x - 5}`}
                fill="none"
                stroke={e.hard ? '#789989' : '#a9aca9'}
                strokeWidth="1.5"
                strokeDasharray={e.hard ? undefined : '5 4'}
                markerEnd="url(#work-arrow)"
              />
            );
          })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const blocked = blockers(project, n.id);
          const final = w.lines.some((l) => l.finalNodeId === n.id);
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`任务图节点：${n.title}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(n.id);
                }
              }}
              className={`work-graph-node ${selectedId === n.id ? 'selected' : ''}`}
              transform={`translate(${p.x},${p.y})`}
            >
              <rect
                width="206"
                height="90"
                rx="10"
                stroke={
                  blocked.length
                    ? '#c18e55'
                    : n.work.status === 'done'
                      ? '#70a285'
                      : final
                        ? '#527caa'
                        : '#bec9c0'
                }
                strokeWidth={final ? 2 : 1}
              />
              <text x="12" y="20" className="graph-meta">
                {taskKinds[n.work.kind]}
                {final ? ' · 最终节点' : ''}
              </text>
              <text x="12" y="44">
                {n.title.length > 14 ? `${n.title.slice(0, 14)}…` : n.title}
              </text>
              <text x="12" y="68" className="graph-meta">
                {n.work.status === 'done'
                  ? '✓ 已完成'
                  : blocked.length
                    ? `待前置 · ${blocked.length}项`
                    : n.work.progress !== null
                      ? `${n.work.estimated ? '约' : ''}${n.work.progress}%`
                      : '待推进'}
                {n.work.due ? ` · ${n.work.due.slice(5)}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="work-muted">
        从左向右收束到最终节点。实线为强依赖，虚线为提醒；横向距离表示依赖层级，不是日期。跨线前置在节点详情查看。
      </p>
    </div>
  );
}
