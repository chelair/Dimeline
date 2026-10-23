import type { Milestone } from '../domain/types';
export type Measure = (text: string, font: string) => number;
const estimate: Measure = (text, font) =>
  [...text].reduce((s, c) => s + (c.charCodeAt(0) > 255 ? 1 : 0.58), 0) *
  (Number(font.match(/([\d.]+)px/)?.[1]) || 14);
export function textFont(m: Milestone): string {
  return `${m.bold ? 'bold' : 'normal'} ${m.fontSize}px "${m.fontFamily}"`;
}
export function wrapText(
  text: string,
  width: number,
  font: string,
  measure: Measure = estimate,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const c of paragraph) {
      if (line && measure(line + c, font) > width) {
        lines.push(line);
        line = c;
      } else line += c;
    }
    lines.push(line);
  }
  return lines;
}
export function computeOptimalBoxSize(
  m: Milestone,
  measure: Measure = estimate,
): { width: number; height: number; lines: string[] } {
  const font = textFont(m);
  const padding = 24;
  const natural =
    Math.max(
      ...m.title.split('\n').map((line) => measure(line, font)),
      measure(m.date, `${m.dateFontSize}px "${m.fontFamily}"`),
    ) + padding;
  const width = m.autoSize ? Math.max(m.width, Math.min(320, natural)) : m.width;
  const lines = wrapText(m.title, width - padding, font, measure);
  const required = lines.length * m.fontSize * 1.4 + m.dateFontSize * 1.4 + 22;
  return { width, height: m.autoSize ? Math.max(m.height, required) : m.height, lines };
}
