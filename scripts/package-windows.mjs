import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cache = fileURLToPath(new URL('../.cache/electron-builder', import.meta.url));
mkdirSync(cache, { recursive: true });
const child = spawn(
  process.execPath,
  [
    require.resolve('electron-builder/cli.js'),
    '--win',
    process.argv.includes('--dir') ? 'dir' : 'nsis',
    '--x64',
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || cache },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
