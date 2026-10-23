import type { Project, Scene } from '../../domain/types';
export function ConnectionLayer({
  project,
  scene,
  selectedId,
}: {
  project: Project;
  scene: Scene;
  selectedId: string | null;
}) {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  return (
    <g pointerEvents="none">
      {project.links
        .filter((l) => l.enabled)
        .map((l, i) => {
          const a = nodes.get(l.fromId);
          const b = nodes.get(l.toId);
          if (!a || !b) return null;
          const active = l.fromId === selectedId || l.toId === selectedId;
          const y = scene.axisY + 45 + (i % 4) * 7;
          return (
            <g key={l.id} opacity={active ? 0.85 : 0.25}>
              <path
                d={`M ${a.anchorX} ${scene.axisY + 7} V ${y} H ${b.anchorX} V ${scene.axisY + 7}`}
                className="dependency-line"
                fill="none"
                strokeDasharray="4 4"
              />
              {active && (
                <text
                  x={(a.anchorX + b.anchorX) / 2}
                  y={y + 13}
                  textAnchor="middle"
                  className="dependency-label"
                >
                  ≥ {l.minGapDays} 天
                </text>
              )}
            </g>
          );
        })}
    </g>
  );
}
