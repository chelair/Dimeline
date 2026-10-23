import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const install = require.resolve('electron/install.js');
const binary = new URL(
  process.platform === 'win32'
    ? '../node_modules/electron/dist/electron.exe'
    : process.platform === 'darwin'
      ? '../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
      : '../node_modules/electron/dist/electron',
  import.meta.url,
);
if (!existsSync(binary)) {
  console.log('安装 Electron 桌面运行时…');
  let result = spawnSync(process.execPath, [install], { stdio: 'inherit', env: process.env });
  if (result.status !== 0 && !process.env.ELECTRON_MIRROR) {
    console.log('官方下载不可用，尝试镜像（仍校验 Electron 包附带的 SHA256）…');
    result = spawnSync(process.execPath, [install], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' },
    });
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Electron 桌面运行时已就绪');
