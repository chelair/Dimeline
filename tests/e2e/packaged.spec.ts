import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
test('Windows 打包程序真实启动、安全隔离和本地保存', async () => {
  const executablePath = path.resolve('release/win-unpacked/Dimeline.exe');
  test.skip(
    process.platform !== 'win32' || !existsSync(executablePath),
    '请先生成 Windows 打包目录',
  );
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dimeline-packaged-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    DIMELINE_TEST_DATA: dir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const app = await electron.launch({ executablePath, args: [], env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid="timeline-svg"]');
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await page.evaluate(() => typeof window.desktop?.saveProject)).toBe('function');
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process),
    ).toBe('undefined');
    expect(await page.evaluate(() => Object.isFrozen(window.desktop))).toBe(true);
    await page.getByRole('button', { name: '新建事件', exact: true }).first().click();
    await page.getByLabel('事件标题', { exact: true }).fill('打包程序保存验证');
    const file = path.join(dir, '打包程序.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page.getByRole('button', { name: '保存项目（Ctrl+S）', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('项目已保存');
    expect(JSON.parse(await fs.readFile(file, 'utf8')).project.milestones[0].title).toBe(
      '打包程序保存验证',
    );
    await page.getByRole('button', { name: '任务线与秘书', exact: true }).click();
    await page.getByText('将原时间线事件加入任务管理', { exact: true }).click();
    await page.getByRole('button', { name: '打包程序保存验证 ＋', exact: true }).click();
    await page.getByRole('button', { name: '确认执行', exact: true }).click();
    await expect(page.locator('.work-graph-node')).toHaveCount(1);
    await page.getByRole('button', { name: '保存项目（Ctrl+S）', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('项目已保存');
    expect(JSON.parse(await fs.readFile(file, 'utf8')).project.milestones[0].work.status).toBe(
      'todo',
    );
    await page.screenshot({ path: 'artifacts/workbench-packaged.png' });
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  }
});
