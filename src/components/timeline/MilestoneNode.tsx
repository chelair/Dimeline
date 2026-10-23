import { memo, type PointerEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import type { Milestone, NodeGeometry } from '../../domain/types';
import { pathData } from '../../engine/routingEngine';
interface Props {
  milestone: Milestone;
  geometry: NodeGeometry;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
  onEdit: () => void;
  onDrag: (e: PointerEvent, mode: 'date' | 'box') => void;
}
export const MilestoneNode = memo(function MilestoneNode({
  milestone: m,
  geometry: n,
  selected,
  zoom,
  onSelect,
  onEdit,
  onDrag,
}: Props) {
  const gray = '#9CA3AF';
  const color = m.completed ? gray : m.textColor;
  const arrow = m.completed ? gray : m.arrowColor;
  const opacity = selected
    ? 1
    : m.level === 4 && zoom < 3.6
      ? 0.45
      : m.level === 3 && zoom < 2.4
        ? 0.65
        : 1;
  const end = n.points.at(-1)!;
  const above = m.side === 'above';
  return (
    <g className={`milestone ${selected ? 'selected' : ''}`} opacity={opacity} data-node-id={m.id}>
      <path
        d={pathData(n.points)}
        fill="none"
        stroke={arrow}
        strokeWidth={(m.arrowWidth * 4) / 3}
        strokeLinejoin="round"
        pointerEvents="none"
      />
      <path
        d={`M ${end.x - 4} ${end.y + (above ? -7 : 7)} L ${end.x} ${end.y} L ${end.x + 4} ${end.y + (above ? -7 : 7)} Z`}
        fill={arrow}
        pointerEvents="none"
      />
      <circle
        className="date-handle"
        data-testid={`anchor-${m.id}`}
        cx={n.anchorX}
        cy={end.y}
        r={selected ? 7 : 5}
        fill={selected ? '#4279ca' : arrow}
        stroke="var(--canvas)"
        strokeWidth="2"
        onPointerDown={(e) => onDrag(e, 'date')}
      >
        <title>拖动调整日期 · {m.date}</title>
      </circle>
      <g
        className="node-body"
        data-testid={`node-${m.id}`}
        onPointerDown={(e) => {
          onSelect();
          if (e.button === 2 || (e.button === 0 && e.altKey)) onDrag(e, 'box');
          e.stopPropagation();
        }}
        onDoubleClick={onEdit}
        onContextMenu={(e) => e.preventDefault()}
      >
        {selected && (
          <rect
            x={n.x - 4}
            y={n.y - 4}
            width={n.width + 8}
            height={n.height + 8}
            rx="10"
            fill="none"
            stroke="#75a1db"
            strokeWidth="1.5"
          />
        )}
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx="6"
          fill={m.fillEnabled ? (m.completed ? '#f0f1f3' : m.fillColor) : 'var(--canvas)'}
          stroke={m.borderStyle === 'none' ? 'none' : m.completed ? gray : m.borderColor}
          strokeWidth={m.borderWidth}
          strokeDasharray={m.borderStyle === 'dashed' ? '5 4' : undefined}
        />
        <svg
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          overflow="hidden"
          pointerEvents="none"
        >
          <g fill={color} fontFamily={`${m.fontFamily}, sans-serif`}>
            {n.lines.map((line, i) => (
              <text
                key={i}
                x="12"
                y={12 + m.fontSize + i * m.fontSize * 1.4}
                fontSize={m.fontSize}
                fontWeight={m.bold ? 'bold' : 'normal'}
              >
                {line}
              </text>
            ))}
            <text x="12" y={n.height - 12} fontSize={m.dateFontSize} opacity="0.75">
              {m.date.replaceAll('-', '.')}
            </text>
          </g>
        </svg>
        {(m.locked || m.layoutLocked) && (
          <LockKeyhole
            x={n.x + n.width - 18}
            y={n.y + 6}
            size={11}
            color={color}
            pointerEvents="none"
          />
        )}
        <title>
          {m.title} · {m.date}\n双击编辑 · Alt + 拖动调整位置
        </title>
      </g>
    </g>
  );
});
