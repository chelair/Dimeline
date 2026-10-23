import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixture, link } from '../helpers';
import { presets } from '../../src/domain/defaults';
import { addDays } from '../../src/engine/dateEngine';
let app: ElectronApplication;
let page: Page;
let dir: string;
let file: string;
async function saveDialog(target: string, cancel = false) {
  await app.evaluate(
    ({ dialog }, { target, cancel }) => {
      dialog.showSaveDialog = async () => ({ canceled: cancel, filePath: cancel ? '' : target });
    },
    { target, cancel },
  );
}
async function openFile(target: string) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, target);
  await page.keyboard.press('Control+o');
}
test.beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dimeline-e2e-'));
  file = path.join(dir, '项目.json');
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    DIMELINE_TEST_DATA: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env });
  page = await app.firstWindow();
  await page.waitForSelector('[data-testid="timeline-svg"]');
});
test.afterEach(async () => {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close().catch(() => {});
  }
  if (dir) await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
});
test('真实窗口：创建、编辑、保存、关闭、重启、再加载', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '新建事件', exact: true }).first().click();
  await page.getByLabel('事件标题', { exact: true }).fill('中文里程碑\n第二行');
  await page.getByLabel('事件日期', { exact: true }).click();
  const date = await page.getByLabel('事件日期', { exact: true }).inputValue();
  await saveDialog(file);
  await page.locator('.canvas-caption').click();
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status')).toContainText('项目已保存');
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(saved.project.milestones[0].title).toBe('中文里程碑\n第二行');
  expect(saved.project.milestones[0].date).toBe(date);
  await app.close();
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    DIMELINE_TEST_DATA: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  await page.waitForSelector('[data-testid="timeline-svg"]');
  await openFile(file);
  await expect(page.locator('.node-body')).toHaveCount(1);
  await page.locator('.node-body').click();
  await expect(page.getByLabel('事件标题', { exact: true })).toHaveValue('中文里程碑\n第二行');
  expect(errors).toEqual([]);
});
test('依赖链拖动、事务撤销、焦点保护与取消拖动', async () => {
  const p = fixture();
  p.links = [link('A', 'B', 5), link('B', 'C', 5)];
  await fs.writeFile(file, JSON.stringify(p));
  await openFile(file);
  await expect(page.locator('.node-body')).toHaveCount(3);
  const anchor = page.getByTestId('anchor-A');
  const rect = (await anchor.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 65, rect.y + rect.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.statusbar')).toContainText('可撤销 1');
  await page.getByTestId('node-C').click();
  expect(await page.getByLabel('事件日期', { exact: true }).inputValue()).not.toBe('2026-01-20');
  await page.locator('.canvas-caption').click();
  await page.keyboard.press('Control+z');
  await page.getByTestId('node-C').click();
  await expect(page.getByLabel('事件日期', { exact: true })).toHaveValue('2026-01-20');
  await page.getByLabel('事件标题', { exact: true }).focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.node-body')).toHaveCount(3);
  await page.getByLabel('事件标题', { exact: true }).fill('C');
  await page.getByLabel('事件日期', { exact: true }).click();
  const next = (await page.getByTestId('anchor-A').boundingBox())!;
  await page.mouse.move(next.x + 5, next.y + 5);
  await page.mouse.down();
  await page.mouse.move(next.x + 100, next.y + 5, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.getByTestId('node-A').click();
  await expect(page.getByLabel('事件日期', { exact: true })).toHaveValue('2026-01-10');
});
test('滚动后连续鼠标缩放锚点稳定，Alt 拖动不改日期，布局锁保留', async () => {
  const p = fixture(['2026-06-01', '2026-06-01', '2026-06-01']);
  await fs.writeFile(file, JSON.stringify(p));
  await openFile(file);
  await page.getByLabel('缩放倍率', { exact: true }).selectOption('2');
  await page.getByTestId('canvas-scroll').evaluate((el) => (el.scrollLeft = 200));
  const anchor = page.getByTestId('anchor-A');
  const before = (await anchor.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(page.getByLabel('缩放倍率', { exact: true })).toHaveValue('2.2');
  const after = (await anchor.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect(page.getByLabel('缩放倍率', { exact: true })).toHaveValue('2');
  expect(Math.abs((await anchor.boundingBox())!.x - before.x)).toBeLessThan(2);
  await page.getByTestId('node-A').click();
  const node = (await page.getByTestId('node-A').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(node.x + 20, node.y + 20);
  await page.mouse.down();
  await page.mouse.move(node.x + 70, node.y + 55, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.getByLabel('事件日期', { exact: true })).toHaveValue('2026-06-01');
  await page.getByLabel('锁定布局', { exact: true }).check();
  const lockedBefore = await page.getByTestId('node-A').boundingBox();
  await page.getByRole('button', { name: '自动整理布局（可撤销）', exact: true }).click();
  const lockedAfter = await page.getByTestId('node-A').boundingBox();
  expect(lockedAfter!.x).toBeCloseTo(lockedBefore!.x, 0);
  expect(lockedAfter!.y).toBeCloseTo(lockedBefore!.y, 0);
});
test('关闭选择保存但取消文件对话框，窗口保留；保存失败也保留', async () => {
  await page.getByRole('button', { name: '新建事件', exact: true }).first().click();
  await saveDialog(file, true);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.getByTestId('timeline-svg')).toBeVisible();
  await expect.poll(() => app.windows().length).toBe(1);
  await saveDialog(path.join(dir, '不存在', '失败.json'));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.getByRole('status')).toContainText('保存失败');
  expect(app.windows()).toHaveLength(1);
});
test('建立关联、最小间隔预览与循环拒绝', async () => {
  const p = fixture();
  await fs.writeFile(file, JSON.stringify(p));
  await openFile(file);
  await page.getByTestId('node-B').click();
  await page.getByLabel('前置事件', { exact: true }).selectOption('A');
  await page.getByLabel('新增最小间隔', { exact: true }).fill('20');
  await page.getByRole('button', { name: '新增关联', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('需要调整日期');
  await page.getByRole('button', { name: '应用日期调整', exact: true }).click();
  await expect(page.getByLabel('事件日期', { exact: true })).toHaveValue('2026-01-30');
  await page.getByTestId('node-A').click();
  await page.getByLabel('前置事件', { exact: true }).selectOption('B');
  await page.getByRole('button', { name: '新增关联', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('循环');
});
test('完整中文多行 PNG 与视口导出真实生成', async () => {
  const p = fixture(['2026-02-05', '2026-04-16', '2026-07-20', '2026-10-09']);
  p.title = '产品研发与交付计划';
  p.milestones = p.milestones.map((m, i) => ({
    ...m,
    level: (i + 1) as 1 | 2 | 3 | 4,
    ...presets[(i + 1) as 1 | 2 | 3 | 4],
    title: ['项目启动\n设计评审', '开发里程碑', '产品验收\n质量评估', '正式交付'][i],
    side: i % 2 ? 'below' : 'above',
  }));
  p.milestones[0].offsetX = 85;
  p.milestones[3].offsetX = -65;
  p.links = [link('A', 'B', 3), link('B', 'C', 5), link('C', 'D', 10)];
  await fs.writeFile(file, JSON.stringify(p));
  await openFile(file);
  const target = path.join(dir, '中文时间线.png');
  await saveDialog(target);
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  await page.getByRole('button', { name: '完整时间线 · PNG @2x', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('高清 PNG 已导出');
  const bytes = await fs.readFile(target);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(1500);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(1000);
  await fs.mkdir('artifacts', { recursive: true });
  await fs.copyFile(target, 'artifacts/export-verified.png');
  await page.screenshot({ path: 'artifacts/desktop-verified.png' });
  await page.getByLabel('缩放倍率', { exact: true }).selectOption('2');
  await page.getByTestId('canvas-scroll').evaluate((el) => (el.scrollLeft = 250));
  const viewTarget = path.join(dir, '视口.png');
  await saveDialog(viewTarget);
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  await page.getByRole('button', { name: '当前视口 · PNG @2x', exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return (await fs.stat(viewTarget)).size;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(1000);
  const view = await fs.readFile(viewTarget);
  const dimensions = await page
    .getByTestId('canvas-scroll')
    .evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight }));
  expect(view.readUInt32BE(16)).toBe(dimensions.width * 2);
  expect(view.readUInt32BE(20)).toBe(dimensions.height * 2);
  await saveDialog(target);
  await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  await page.getByRole('button', { name: '完整时间线 · PNG @2x', exact: true }).click();
  await expect
    .poll(async () => (await fs.readFile(target)).readUInt32BE(16))
    .toBeGreaterThan(bytes.readUInt32BE(16));
});
test('未失焦标题受到关闭保护，选择保存会提交表单后关闭', async () => {
  await fs.writeFile(file, JSON.stringify(fixture()));
  await openFile(file);
  await page.getByTestId('node-A').click();
  await page.getByLabel('事件标题', { exact: true }).fill('尚未失焦的修改');
  await expect(page.locator('.save-state')).toContainText('未保存修改');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  const closed = page.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  expect(JSON.parse(await fs.readFile(file, 'utf8')).project.milestones[0].title).toBe(
    '尚未失焦的修改',
  );
});
test('中文输入法编辑、Escape 取消、右键拖框、空格平移与深色主题', async () => {
  await fs.writeFile(file, JSON.stringify(fixture(['2026-05-01'])));
  await openFile(file);
  await page.getByTestId('node-A').dblclick();
  const editor = page.getByTestId('inline-editor');
  await editor.fill('输入法测试');
  await editor.dispatchEvent('compositionstart');
  await editor.press('Enter');
  await expect(editor).toBeVisible();
  await editor.dispatchEvent('compositionend');
  await editor.fill('完成中文输入');
  await editor.press('Enter');
  await page.getByTestId('node-A').click();
  await expect(page.getByLabel('事件标题', { exact: true })).toHaveValue('完成中文输入');
  await page.getByTestId('node-A').dblclick();
  await page.getByTestId('inline-editor').fill('取消的修改');
  await page.getByTestId('inline-editor').press('Escape');
  await expect(page.getByLabel('事件标题', { exact: true })).toHaveValue('完成中文输入');
  const node = (await page.getByTestId('node-A').boundingBox())!;
  await page.mouse.move(node.x + 15, node.y + 15);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(node.x + 70, node.y + 40, { steps: 7 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByLabel('事件日期', { exact: true })).toHaveValue('2026-05-01');
  await page.getByLabel('缩放倍率', { exact: true }).selectOption('3');
  await page.locator('.canvas-caption').click();
  const el = page.getByTestId('canvas-scroll');
  await el.evaluate((e) => (e.scrollLeft = 250));
  const box = (await el.boundingBox())!;
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 200, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await el.evaluate((e) => e.scrollLeft)).toBeGreaterThan(300);
  await page.getByRole('button', { name: '切换浅色/深色主题', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'artifacts/desktop-dark-verified.png' });
});
test('100 / 200 节点含多级依赖的桌面渲染与缩放', async () => {
  const timings: Record<string, number> = {};
  for (const count of [100, 200]) {
    const p = fixture(
      Array.from({ length: count }, (_, i) => addDays('2026-01-10', Math.floor(i / 2))),
    );
    p.milestones = p.milestones.map((m, i) => ({
      ...m,
      id: `event-${i}`,
      title: `节点 ${i + 1}`,
      side: i % 2 ? 'below' : 'above',
    }));
    p.links = p.milestones.slice(1).map((m, i) => link(p.milestones[i].id, m.id, 0));
    await fs.writeFile(file, JSON.stringify(p));
    const started = performance.now();
    await openFile(file);
    await expect(page.locator('.node-body')).toHaveCount(count);
    await page.getByLabel('缩放倍率', { exact: true }).selectOption('2');
    await expect(page.getByLabel('缩放倍率', { exact: true })).toHaveValue('2');
    timings[`${count} nodes open + zoom ms`] = Math.round(performance.now() - started);
  }
  await fs.writeFile('artifacts/desktop-performance.json', JSON.stringify(timings, null, 2));
});
