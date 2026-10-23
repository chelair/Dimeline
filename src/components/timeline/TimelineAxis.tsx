import { generateTicks } from '../../engine/dateEngine';
import { dateToWorldX } from '../../engine/coordinateEngine';
import type { Project, Scene } from '../../domain/types';
export function TimelineAxis({ project, scene }: { project: Project; scene: Scene }) {
  const { axisY, margin, contentWidth, height } = scene;
  return (
    <g className="timeline-axis" pointerEvents="none">
      {generateTicks(project.startDate, project.endDate, contentWidth).map((t) => {
        const x = dateToWorldX(t.date, {
          start: project.startDate,
          end: project.endDate,
          contentWidth,
          margin,
        });
        return (
          <g key={t.date}>
            <line
              x1={x}
              x2={x}
              y1={65}
              y2={height - 45}
              className="grid-line"
              strokeDasharray="3 7"
            />
            <line x1={x} x2={x} y1={axisY - 5} y2={axisY + 5} stroke={project.mainLine.color} />
            <text x={x} y={axisY + 27} textAnchor="middle" className="axis-label">
              {t.label}
            </text>
          </g>
        );
      })}
      <path
        d={`M ${margin - 24} ${axisY} H ${margin + contentWidth + 28}`}
        fill="none"
        stroke={project.mainLine.color}
        strokeWidth={(project.mainLine.width * 4) / 3}
      />
      <path
        d={`M ${margin + contentWidth + 26} ${axisY - 5} l 10 5 l -10 5 Z`}
        fill={project.mainLine.color}
      />
      <circle cx={margin - 24} cy={axisY} r="4" fill={project.mainLine.color} />
    </g>
  );
}
