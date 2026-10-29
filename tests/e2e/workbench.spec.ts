import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('口述三条工作线：预览确认、任务联动、保存重开及审计撤销', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dimeline-work-e2e-'));
  const target = path.join(dir, '产品项目.dimeline');
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
  env.DIMELINE_TEST_DATA = dir;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  let app: ElectronApplication | undefined;
  const errors: string[] = [];
  try {
    app = await electron.launch({ args: ['.'], env });
    let page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: '任务线与秘书', exact: true }).click();
    await page
      .getByLabel('口述工作进展')
      .fill(
        '今天完成了工艺规程的评审汇报材料撰写，待先在组内汇报，然后拿到会议纪要后再在每周四的SEG会议上汇报，汇报过拿到会议纪要就可以归档。今天振动测试NG的回归测试完成了，我要去检视样机，如果没问题再经过一次充放电然后测试通过才闭环。今天核对了物料入库，XX物料不足，需要申报紧急计划外物料，其他联系各领域送到打样厂。',
      );
    await page.getByRole('button', { name: '本地整理', exact: true }).click();
    await expect(page.getByLabel('变更预览')).toContainText('新建任务线：工艺规程');
    await expect(page.locator('.work-line-link')).toHaveCount(1);
    await page.getByRole('button', { name: '确认执行', exact: true }).click();
    await expect(page.locator('.work-line-link')).toHaveCount(4);
    await page.getByRole('button', { name: '节点列表', exact: true }).click();
    await expect(page.locator('.work-node-card')).toHaveCount(16);
    await expect(
      page.locator('.work-node-card').filter({ hasText: '本轮振动回归执行' }),
    ).toContainText('已完成');
    await page.locator('.work-node-card').filter({ hasText: '检视样机与测试结果' }).click();
    await expect(page.getByLabel('任务详情')).toContainText('未关闭');
    await page.getByLabel('口述工作进展').fill('检视样机与测试结果搞了50%，卡在等样机');
    await page.getByRole('button', { name: '本地整理', exact: true }).click();
    await expect(page.getByLabel('任务进度')).toHaveValue('50');
    await page.getByRole('button', { name: '在时间线查看 ↗', exact: true }).click();
    await expect(page.getByTestId('timeline-svg')).toBeVisible();
    await expect(page.locator('.node-body')).toHaveCount(16);
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, target);
    await page.getByRole('button', { name: '保存项目（Ctrl+S）', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('项目已保存');
    const saved = JSON.parse(await fs.readFile(target, 'utf8'));
    expect(saved.schemaVersion).toBe(2);
    expect(saved.project.workspace.issues[0].status).toBe('open');
    expect(saved.project.workspace.audits).toHaveLength(2);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    app = await electron.launch({ args: ['.'], env });
    page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('[data-testid="timeline-svg"]');
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, target);
    await page.keyboard.press('Control+o');
    await expect(page.locator('.node-body')).toHaveCount(16);
    await page.getByRole('button', { name: '任务线与秘书', exact: true }).click();
    await page.getByRole('button', { name: /记录与经验/ }).click();
    await expect(page.locator('.work-record')).toHaveCount(2);
    await page
      .getByRole('button', { name: '撤销此操作', exact: true })
      .filter({ visible: true })
      .evaluateAll((buttons) =>
        (buttons.find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement).click(),
      );
    await expect(page.locator('.work-record')).toHaveCount(3);
    await fs.mkdir(path.join(process.cwd(), 'artifacts'), { recursive: true });
    await page.screenshot({ path: 'artifacts/workbench-records.png' });
    await page.getByRole('button', { name: /任务线 \d/ }).click();
    await page.screenshot({ path: 'artifacts/workbench-overview.png' });
    expect(errors).toEqual([]);
  } finally {
    if (app) {
      await app
        .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
        .catch(() => {});
      await app.close().catch(() => {});
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  }
});
