const DAY = 86_400_000;
export function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`无效日期：${value}`);
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  if (
    y < 1 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    throw new Error(`无效日期：${value}`);
  return date.getTime() / DAY;
}
export function fromDayNumber(value: number): string {
  const date = new Date(Math.round(value) * DAY);
  const text = date.toISOString().slice(0, 10);
  dayNumber(text);
  return text;
}
export const diffDays = (a: string, b: string) => dayNumber(b) - dayNumber(a);
export const addDays = (date: string, count: number) => fromDayNumber(dayNumber(date) + count);
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export interface Tick {
  date: string;
  major: boolean;
  label: string;
}
export function generateTicks(start: string, end: string, pixels: number): Tick[] {
  const total = diffDays(start, end);
  if (total <= 0) return [];
  const map = new Map<string, Tick>();
  const put = (date: string, major: boolean) =>
    map.set(date, {
      date,
      major,
      label: major ? date.slice(0, 7).replace('-', '.') : date.slice(5).replace('-', '/'),
    });
  put(start, true);
  put(end, true);
  const month = new Date(dayNumber(start) * DAY);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() + 1);
  const endDay = dayNumber(end);
  while (month.getTime() / DAY < endDay) {
    put(fromDayNumber(month.getTime() / DAY), true);
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  if (pixels / total > 9) {
    const step = pixels / total > 55 ? 1 : 7;
    for (let i = step; i < total; i += step)
      if (!map.has(addDays(start, i))) put(addDays(start, i), false);
  }
  let last = -Infinity;
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((t) => {
      const x = (diffDays(start, t.date) / total) * pixels;
      if (t.date === end) return true;
      const closeToMajor =
        !t.major &&
        [...map.values()].some(
          (major) =>
            major.major && Math.abs((diffDays(start, major.date) / total) * pixels - x) < 65,
        );
      if (closeToMajor || x - last < 65 || (pixels - x < 65 && t.date !== start)) return false;
      last = x;
      return true;
    });
}
