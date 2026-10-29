import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project, Result } from '../src/domain/types';
import { atomicWrite, readProject, writeProject } from './services/fileService';
import { RecentFilesService } from './services/recentFilesService';
import { AssistantService } from './services/assistantService';
let win: BrowserWindow;
let currentPath: string | null = null;
let dirty = false;
let closing = false;
let closeDialog = false;
let pending: { token: string; resolve: (ok: boolean) => void } | null = null;
const devUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = !app.isPackaged && devUrl === 'http://127.0.0.1:5173';
if (process.env.DIMELINE_TEST_DATA) app.setPath('userData', process.env.DIMELINE_TEST_DATA);
function check(event: IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('未授权的调用');
  const url = event.senderFrame?.url ?? '';
  if (isDev ? !url.startsWith(devUrl + '/') : !url.startsWith('file://'))
    throw new Error('无效来源');
}
async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
const filters = [{ name: 'Dimeline 项目', extensions: ['json', 'dimeline'] }];
async function confirmReplace(): Promise<'save' | 'discard' | 'cancel'> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: '未保存的修改',
    message: '是否保存当前项目的修改？',
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return (['save', 'discard', 'cancel'] as const)[response];
}
async function bootstrap() {
  const recents = new RecentFilesService(path.join(app.getPath('userData'), 'recent-files.json'));
  await recents.init();
  const assistant = new AssistantService(
    path.join(app.getPath('userData'), 'assistant-settings.json'),
  );
  await assistant.init();
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Dimeline',
    backgroundColor: '#f6f7f3',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  const handle = <T>(channel: string, fn: (...args: unknown[]) => Promise<T>) =>
    ipcMain.handle(channel, (event, ...args) => {
      check(event);
      return fn(...args);
    });
  handle('app:version', async () => app.getVersion());
  handle('assistant:settings', async () => assistant.publicSettings());
  handle('assistant:configure', async (settings) => guard(() => assistant.configure(settings)));
  handle('assistant:parse', async (text, context) => guard(() => assistant.parse(text, context)));
  handle('recent:list', async () => recents.list());
  handle('recent:remove', async (target) => {
    if (typeof target !== 'string' || !recents.has(target)) return recents.list();
    return recents.remove(target);
  });
  handle('project:reset', async () => {
    currentPath = null;
    dirty = false;
  });
  handle('project:confirm', confirmReplace);
  handle('project:open', async (requested) => {
    let target: string;
    if (typeof requested === 'string') {
      if (!recents.has(requested)) return { ok: false, error: '仅可打开最近文件中的已授权路径' };
      target = requested;
    } else {
      const result = await dialog.showOpenDialog(win, {
        title: '打开时间线项目',
        filters,
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0])
        return { ok: false, cancelled: true, error: '已取消打开' };
      target = result.filePaths[0];
    }
    return guard(async () => {
      const data = await readProject(target);
      currentPath = target;
      dirty = false;
      await recents.add(target).catch(() => {});
      return { path: target, ...data };
    });
  });
  handle('project:save', async (raw, saveAs) => {
    const project = raw as Project;
    let target = currentPath;
    if (saveAs || !target) {
      const result = await dialog.showSaveDialog(win, {
        title: '保存时间线项目',
        defaultPath:
          target ??
          `${String(project.title)
            .replace(/[<>:"/\\|?*]/g, '_')
            .slice(0, 100)}.json`,
        filters,
      });
      if (result.canceled || !result.filePath)
        return { ok: false, cancelled: true, error: '已取消保存' };
      target = result.filePath;
    }
    const chosen = target;
    if (!['.json', '.dimeline'].includes(path.extname(chosen).toLowerCase()))
      return { ok: false, error: '项目扩展名必须为 .json 或 .dimeline' };
    return guard(async () => {
      await writeProject(chosen, project);
      currentPath = chosen;
      await recents.add(chosen).catch(() => {});
      return { path: chosen };
    });
  });
  handle('image:export', async (raw, title) => {
    if (
      !(raw instanceof Uint8Array) ||
      raw.length < 8 ||
      raw.length > 100 * 1024 * 1024 ||
      !Buffer.from(raw.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return { ok: false, error: 'PNG 数据无效或超过 100 MB' };
    const result = await dialog.showSaveDialog(win, {
      title: '导出高清 PNG',
      defaultPath: `${String(title)
        .replace(/[<>:"/\\|?*]/g, '_')
        .slice(0, 100)}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath)
      return { ok: false, cancelled: true, error: '已取消导出' };
    const target = result.filePath;
    if (path.extname(target).toLowerCase() !== '.png')
      return { ok: false, error: '图片扩展名必须为 .png' };
    return guard(async () => {
      await atomicWrite(target, raw);
      return { path: target };
    });
  });
  ipcMain.on('window:dirty', (event, value) => {
    check(event);
    dirty = value === true;
  });
  ipcMain.on('window:save-result', (event, token, ok) => {
    check(event);
    const request = pending;
    if (request && request.token === token) {
      request.resolve(ok === true);
      pending = null;
    }
  });
  win.on('close', (event) => {
    if (closing || !dirty) return;
    event.preventDefault();
    if (closeDialog) return;
    closeDialog = true;
    void (async () => {
      try {
        const choice = await confirmReplace();
        if (choice === 'cancel') return;
        if (choice === 'save') {
          const token = randomUUID();
          const ok = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
              if (pending?.token === token) {
                pending = null;
                resolve(false);
              }
            }, 120000);
            pending = {
              token,
              resolve: (result) => {
                clearTimeout(timer);
                resolve(result);
              },
            };
            win.webContents.send('window:save-request', token);
          });
          if (!ok) return;
        }
        closing = true;
        win.close();
      } finally {
        closeDialog = false;
      }
    })();
  });
  win.once('ready-to-show', () => win.show());
  if (isDev) await win.loadURL(devUrl);
  else await win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app
  .whenReady()
  .then(bootstrap)
  .catch((error) => {
    dialog.showErrorBox('Dimeline 启动失败', String(error));
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
