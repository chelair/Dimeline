export type Level = 1 | 2 | 3 | 4;
export type Side = 'above' | 'below';
export interface Milestone {
  id: string;
  title: string;
  date: string;
  level: Level;
  side: Side;
  completed: boolean;
  locked: boolean;
  layoutLocked: boolean;
  fontFamily: string;
  bold: boolean;
  fontSize: number;
  dateFontSize: number;
  textColor: string;
  arrowColor: string;
  arrowWidth: number;
  arrowType: 'straight' | 'elbow';
  width: number;
  height: number;
  autoSize: boolean;
  fillEnabled: boolean;
  fillColor: string;
  borderStyle: 'solid' | 'dashed' | 'none';
  borderColor: string;
  borderWidth: number;
  offsetX: number;
  offsetY: number;
  layout: 'auto' | 'manual';
}
export interface Link {
  id: string;
  fromId: string;
  toId: string;
  minGapDays: number;
  enabled: boolean;
}
export interface Project {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  mainLine: { color: string; width: number };
  milestones: Milestone[];
  links: Link[];
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface NodeGeometry extends Rect {
  id: string;
  anchorX: number;
  points: Point[];
  lines: string[];
}
export interface Scene {
  nodes: NodeGeometry[];
  axisY: number;
  width: number;
  height: number;
  margin: number;
  contentWidth: number;
  warnings: string[];
}
export interface RecentFile {
  path: string;
  name: string;
  time: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; cancelled?: boolean };
export interface OpenedFile {
  path: string;
  project: Project;
  warnings: string[];
}
export interface DesktopAPI {
  openProject(path?: string): Promise<Result<OpenedFile>>;
  saveProject(project: Project, saveAs?: boolean): Promise<Result<{ path: string }>>;
  exportPng(data: Uint8Array, title: string): Promise<Result<{ path: string }>>;
  getRecentFiles(): Promise<RecentFile[]>;
  removeRecent(path: string): Promise<RecentFile[]>;
  setDirty(dirty: boolean): void;
  resetPath(): Promise<void>;
  confirmReplace(): Promise<'save' | 'discard' | 'cancel'>;
  onSaveBeforeClose(handler: (token: string) => Promise<boolean>): () => void;
  getVersion(): Promise<string>;
}
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
