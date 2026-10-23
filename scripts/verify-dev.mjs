import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
child.stdout.on('data', (data) => (output += data));
child.stderr.on('data', (data) => (output += data));
let exited = false;
child.on('exit', () => (exited = true));
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (exited) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetch('http://127.0.0.1:5173/');
      ready = response.ok && (await response.text()).includes('Dimeline');
      if (ready) break;
    } catch {
      /* server is still starting */
    }
  }
  if (!ready) throw new Error('开发服务未就绪');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (exited) throw new Error(output);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/dev-startup.txt',
    `Electron 开发进程运行正常；Vite http://127.0.0.1:5173/ 返回项目 HTML。\n${output}`,
  );
  console.log('Electron + Vite 开发启动检查通过');
} finally {
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  else child.kill('SIGINT');
}
