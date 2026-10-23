import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { CalendarPlus, MousePointer2, AlertTriangle } from 'lucide-react';
import { useEditor } from '../../store/editorStore';
import { layoutProject } from '../../engine/layoutEngine';
import { anchoredScroll, clampZoom } from '../../engine/coordinateEngine';
import { TimelineAxis } from './TimelineAxis';
import { ConnectionLayer } from './ConnectionLayer';
import { MilestoneNode } from './MilestoneNode';
import { dragPreview, type DragContext } from './TimelineInteraction';
import { isEditing } from '../../hooks/useKeyboard';
import { renderExportSvg, svgToPng } from '../../services/exportService';
import type { Scene } from '../../domain/types';
import { useDraftGuard } from '../../hooks/useDraftGuard';
export interface CanvasCommands {
  zoom: (value: number, anchor?: number) => void;
  exportPng: (viewport?: boolean) => Promise<void>;
  tidy: () => void;
  reset: () => void;
  getScene: () => Scene;
}
export function TimelineCanvas({ onCommands }: { onCommands: (commands: CanvasCommands) => void }) {
  const project = useEditor((s) => s.project);
  const zoom = useEditor((s) => s.zoom);
  const selectedId = useEditor((s) => s.selectedId);
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 600 });
  const drag = useRef<DragContext | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  const pendingFrame = useRef<number>(0);
  const lastMove = useRef<{ dx: number; dy: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const composition = useRef(false);
  const guard = useDraftGuard();
  const measure = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return (text: string, font: string) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    };
  }, []);
  const baseWidth = Math.max(650, viewport.width - 220);
  const calculated = useMemo(
    () => layoutProject(project, baseWidth * zoom, measure),
    [project, baseWidth, zoom, measure],
  );
  const scene = useMemo(() => {
    if (!drag.current) return calculated;
    const dy = drag.current.scene.axisY - calculated.axisY;
    return {
      ...calculated,
      axisY: drag.current.scene.axisY,
      height: Math.max(calculated.height, drag.current.scene.height),
      nodes: calculated.nodes.map((n) => ({
        ...n,
        y: n.y + dy,
        points: n.points.map((p) => ({ ...p, y: p.y + dy })),
      })),
    };
  }, [calculated]);
  const latest = useRef({ scene, baseWidth, zoom, project });
  latest.current = { scene, baseWidth, zoom, project };
  const scrollAfterZoom = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (scrollAfterZoom.current !== null && container.current) {
      container.current.scrollLeft = scrollAfterZoom.current;
      scrollAfterZoom.current = null;
    }
  }, [scene]);
  useEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const setZoom = useCallback(
    (value: number, anchor?: number) => {
      if (drag.current || editing) return;
      const el = container.current!;
      const current = latest.current;
      const z = clampZoom(value);
      const selected = current.scene.nodes.find((n) => n.id === useEditor.getState().selectedId);
      const selectedX = selected ? selected.anchorX - el.scrollLeft : -1;
      const pointer =
        anchor ?? (selectedX >= 0 && selectedX <= el.clientWidth ? selectedX : el.clientWidth / 2);
      const next = layoutProject(current.project, current.baseWidth * z, measure);
      // Both margins participate, including any manual overscan left of the first date.
      scrollAfterZoom.current = anchoredScroll(
        current.scene.contentWidth,
        next.contentWidth,
        el.scrollLeft,
        pointer,
        el.clientWidth,
        current.scene.margin,
        next.margin,
        next.width,
      );
      if (current.zoom === z) {
        scrollAfterZoom.current = null;
        return;
      }
      useEditor.setState({ zoom: z });
    },
    [editing, measure],
  );
  useEffect(() => {
    const element = container.current!;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(
          useEditor.getState().zoom + (e.deltaY < 0 ? 0.2 : -0.2),
          e.clientX - element.getBoundingClientRect().left,
        );
      } else if (e.shiftKey) {
        e.preventDefault();
        element.scrollLeft += e.deltaY || e.deltaX;
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [setZoom]);
  const cancelDrag = useCallback(() => {
    if (pendingFrame.current) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = 0;
    lastMove.current = null;
    const active = !!drag.current;
    drag.current = null;
    pan.current = null;
    setPanning(false);
    if (active) useEditor.getState().cancel();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditing(e.target)) {
        space.current = true;
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        cancelDrag();
        setEditing(null);
        guard(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blur = () => {
      space.current = false;
      cancelDrag();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      if (pendingFrame.current) cancelAnimationFrame(pendingFrame.current);
    };
  }, [cancelDrag]);
  const processMove = () => {
    pendingFrame.current = 0;
    const d = drag.current;
    const move = lastMove.current;
    if (!d || !move) return;
    if (!d.moved && Math.hypot(move.dx, move.dy) < 4) return;
    d.moved = true;
    try {
      useEditor.getState().preview(dragPreview(d, move.dx, move.dy));
    } catch (e) {
      useEditor.getState().notify((e as Error).message, 'error');
    }
  };
  const startDrag = (e: PointerEvent, id: string, mode: 'date' | 'box') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 && e.button !== 2) return;
    const state = useEditor.getState();
    state.select(id);
    const m = state.project.milestones.find((m) => m.id === id)!;
    if (m.locked || (mode === 'box' && m.layoutLocked)) {
      state.notify(m.locked ? '请先解锁事件' : '布局已锁定，请先解除布局锁定', 'error');
      return;
    }
    if (editing) return;
    state.begin(mode === 'date' ? '拖动日期及依赖传播' : '调整文本框位置');
    const el = container.current!;
    drag.current = {
      id,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX - el.getBoundingClientRect().left + el.scrollLeft,
      startY: e.clientY - el.getBoundingClientRect().top + el.scrollTop,
      project: state.project,
      scene,
      moved: false,
    };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const finishDrag = () => {
    if (drag.current) {
      if (pendingFrame.current) cancelAnimationFrame(pendingFrame.current);
      processMove();
      drag.current = null;
      lastMove.current = null;
      useEditor.getState().commit();
    }
    pan.current = null;
    setPanning(false);
  };
  useEffect(() => {
    onCommands({
      zoom: setZoom,
      getScene: () => latest.current.scene,
      reset: () => {
        setZoom(1);
        container.current?.scrollTo({ left: 0, top: 0 });
      },
      tidy: () => {
        useEditor.getState().apply('自动整理布局', (p) => ({
          ...p,
          milestones: p.milestones.map((m) =>
            m.locked || m.layoutLocked ? m : { ...m, layout: 'auto', offsetX: 0, offsetY: 72 },
          ),
        }));
      },
      exportPng: async (currentViewport = false) => {
        try {
          const { project, scene } = latest.current;
          const el = container.current!;
          if (useEditor.getState().transaction) throw new Error('请先完成当前拖拽');
          const area = currentViewport
            ? { x: el.scrollLeft, y: el.scrollTop, width: el.clientWidth, height: el.clientHeight }
            : undefined;
          const data = await svgToPng(
            renderExportSvg(project, scene, area),
            area?.width ?? scene.width,
            area?.height ?? scene.height,
          );
          if (!window.desktop) throw new Error('请使用 Electron 桌面窗口导出图片');
          const result = await window.desktop.exportPng(data, project.title);
          if (result.ok) useEditor.getState().notify('高清 PNG 已导出（2 倍分辨率）');
          else if (!result.cancelled) throw new Error(result.error);
        } catch (e) {
          useEditor.getState().notify(`导出失败：${(e as Error).message}`, 'error');
        }
      },
    });
  }, [onCommands, setZoom]);
  const editNode = editing ? scene.nodes.find((n) => n.id === editing.id) : undefined;
  const commitText = () => {
    if (editing && !composition.current) {
      useEditor.getState().update(editing.id, { title: editing.text.trim() });
      setEditing(null);
      guard(false);
    }
  };
  return (
    <div className="canvas-shell">
      <div className="canvas-caption">
        <span className="eyebrow">TIMELINE / 时间线</span>
        <span>
          {project.startDate.replaceAll('-', '.')} — {project.endDate.replaceAll('-', '.')}
        </span>
      </div>
      <div
        className={`canvas-scroll ${panning ? 'panning' : ''}`}
        ref={container}
        data-testid="canvas-scroll"
      >
        <div
          style={{
            position: 'relative',
            width: scene.width,
            minHeight: Math.max(scene.height, viewport.height),
          }}
        >
          <svg
            ref={svg}
            width={scene.width}
            height={Math.max(scene.height, viewport.height)}
            data-testid="timeline-svg"
            onPointerDownCapture={(e) => {
              if ((space.current && e.button === 0) || e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                const el = container.current!;
                pan.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: el.scrollLeft,
                  top: el.scrollTop,
                };
                setPanning(true);
                svg.current?.setPointerCapture(e.pointerId);
              }
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) useEditor.getState().select(null);
            }}
            onPointerMove={(e) => {
              const el = container.current!;
              if (pan.current) {
                el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
                el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
              } else if (drag.current) {
                lastMove.current = {
                  dx:
                    e.clientX -
                    el.getBoundingClientRect().left +
                    el.scrollLeft -
                    drag.current.startX,
                  dy:
                    e.clientY - el.getBoundingClientRect().top + el.scrollTop - drag.current.startY,
                };
                if (!pendingFrame.current)
                  pendingFrame.current = requestAnimationFrame(processMove);
              }
            }}
            onPointerUp={(e) => {
              finishDrag();
              if (svg.current?.hasPointerCapture(e.pointerId))
                svg.current.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={cancelDrag}
          >
            <ConnectionLayer project={project} scene={scene} selectedId={selectedId} />
            <TimelineAxis project={project} scene={scene} />
            {scene.nodes.map((n) => {
              const m = project.milestones.find((m) => m.id === n.id)!;
              return (
                <MilestoneNode
                  key={n.id}
                  milestone={m}
                  geometry={n}
                  selected={m.id === selectedId}
                  zoom={zoom}
                  onSelect={() => useEditor.getState().select(m.id)}
                  onDrag={(e, mode) => startDrag(e, m.id, mode)}
                  onEdit={() => {
                    if (!m.locked) setEditing({ id: m.id, text: m.title });
                  }}
                />
              );
            })}
          </svg>
          {editing && editNode && (
            <textarea
              className="inline-editor"
              data-testid="inline-editor"
              autoFocus
              value={editing.text}
              style={{
                left: editNode.x,
                top: editNode.y,
                width: editNode.width,
                height: editNode.height,
                fontSize: project.milestones.find((m) => m.id === editing.id)?.fontSize,
              }}
              onChange={(e) => {
                setEditing({ ...editing, text: e.target.value });
                guard(
                  e.target.value !== project.milestones.find((m) => m.id === editing.id)?.title,
                );
              }}
              onCompositionStart={() => (composition.current = true)}
              onCompositionEnd={() => (composition.current = false)}
              onBlur={commitText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing || composition.current) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(null);
                  guard(false);
                }
              }}
            />
          )}
          {!project.milestones.length && (
            <div className="empty-canvas">
              <div className="empty-icon">
                <MousePointer2 size={25} />
              </div>
              <h2>从第一个里程碑开始</h2>
              <p>把重要的节点，放在一条清晰的时间线上。</p>
              <button className="button primary" onClick={() => useEditor.getState().add()}>
                <CalendarPlus size={16} />
                新建事件
              </button>
              <span>或使用顶部工具栏创建事件</span>
            </div>
          )}
        </div>
      </div>
      <div className="canvas-help">
        <span>拖动日期锚点调整日期</span>
        <i /> <span>Alt + 拖动移动文本框</span>
        <i />
        <span>Ctrl + 滚轮缩放 · 空格 + 拖动平移</span>
      </div>
      {scene.warnings.length > 0 && (
        <div className="layout-warning" title={scene.warnings.join('\n')}>
          <AlertTriangle size={13} />
          {scene.warnings.length} 处布局提示
        </div>
      )}
    </div>
  );
}
