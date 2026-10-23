import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'vite';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('Vite 开发模式真实窗口可编辑', async () => {
  const server = await createServer();
  await server.listen();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dimeline-dev-e2e-'));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    DIMELINE_TEST_DATA: dir,
    VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(page.getByTestId('timeline-svg')).toBeVisible();
    expect(page.url()).toContain('127.0.0.1:5173');
    await page.getByRole('button', { name: '新建事件', exact: true }).first().click();
    await expect(page.locator('.node-body')).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {});
    await app.close().catch(() => {});
    await server.close();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  }
});
