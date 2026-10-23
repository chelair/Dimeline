import type { Project, Scene } from '../domain/types';
import { generateTicks } from '../engine/dateEngine';
import { dateToWorldX } from '../engine/coordinateEngine';
import { pathData } from '../engine/routingEngine';
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export interface ExportViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function renderExportSvg(project: Project, scene: Scene, viewport?: ExportViewport): string {
  const { width, height, axisY } = scene;
  const rect = viewport ?? { x: 0, y: 0, width, height };
  const title = `<text x="${scene.margin}" y="38" font-family="Microsoft YaHei, sans-serif" font-size="20" font-weight="bold" fill="#263c36">${esc(project.title)}</text>`;
  const axis = `<path d="M ${scene.margin - 20} ${axisY} H ${scene.margin + scene.contentWidth + 24}" stroke="${project.mainLine.color}" stroke-width="${(project.mainLine.width * 4) / 3}" fill="none"/><path d="M ${scene.margin + scene.contentWidth + 24} ${axisY - 5} l 9 5 l -9 5 Z" fill="${project.mainLine.color}"/>`;
  const ticks = generateTicks(project.startDate, project.endDate, scene.contentWidth)
    .map((t) => {
      const x = dateToWorldX(t.date, {
        start: project.startDate,
        end: project.endDate,
        contentWidth: scene.contentWidth,
        margin: scene.margin,
      });
      return `<path d="M ${x} ${axisY - 5} v 10" stroke="${project.mainLine.color}"/><text x="${x}" y="${axisY + 26}" text-anchor="middle" font-size="11" font-family="Microsoft YaHei, sans-serif" fill="#6f7772">${t.label}</text>`;
    })
    .join('');
  const map = new Map(project.milestones.map((m) => [m.id, m]));
  const nodeMap = new Map(scene.nodes.map((m) => [m.id, m]));
  const dependencies = project.links
    .filter((l) => l.enabled)
    .map((l) => {
      const a = nodeMap.get(l.fromId)!;
      const b = nodeMap.get(l.toId)!;
      return `<path d="M ${a.anchorX} ${axisY + 42} V ${axisY + 52} H ${b.anchorX} V ${axisY + 42}" fill="none" stroke="#9aafc2" stroke-dasharray="4 4" opacity="0.6"/>`;
    })
    .join('');
  const nodes = scene.nodes
    .map((n) => {
      const m = map.get(n.id)!;
      const color = m.completed ? '#9CA3AF' : m.textColor;
      const arrow = m.completed ? '#9CA3AF' : m.arrowColor;
      const end = n.points.at(-1)!;
      const above = m.side === 'above';
      const lines = n.lines
        .map(
          (line, i) =>
            `<text x="${n.x + 12}" y="${n.y + 12 + m.fontSize + i * m.fontSize * 1.4}" font-size="${m.fontSize}" font-weight="${m.bold ? 'bold' : 'normal'}">${esc(line)}</text>`,
        )
        .join('');
      return `<g><path d="${pathData(n.points)}" fill="none" stroke="${arrow}" stroke-width="${(m.arrowWidth * 4) / 3}" stroke-linejoin="round"/><path d="M ${end.x - 4} ${end.y + (above ? -7 : 7)} L ${end.x} ${end.y} L ${end.x + 4} ${end.y + (above ? -7 : 7)} Z" fill="${arrow}"/><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="6" fill="${m.fillEnabled ? (m.completed ? '#edf0f2' : m.fillColor) : '#ffffff'}" stroke="${m.borderStyle === 'none' ? 'none' : m.completed ? '#9CA3AF' : m.borderColor}" stroke-width="${m.borderWidth}" ${m.borderStyle === 'dashed' ? 'stroke-dasharray="5 4"' : ''}/><svg x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" overflow="hidden"><g transform="translate(${-n.x},${-n.y})" fill="${color}" font-family="${esc(m.fontFamily)}, sans-serif">${lines}<text x="${n.x + 12}" y="${n.y + n.height - 12}" font-size="${m.dateFontSize}" opacity="0.8">${m.date.replaceAll('-', '.')}</text></g></svg></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}" viewBox="${rect.x} ${rect.y} ${rect.width} ${rect.height}"><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="white"/>${title}${dependencies}${axis}${ticks}${nodes}</svg>`;
}
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Uint8Array> {
  if (
    width * height * scale * scale > 100_000_000 ||
    width * scale > 32767 ||
    height * scale > 32767
  )
    throw new Error('导出尺寸过大，请缩小缩放倍率或选择导出当前视口');
  await document.fonts.ready;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建图片画布');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png'),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
