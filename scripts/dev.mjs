import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { createServer } from 'vite';
import electron from 'electron';
await build({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
});
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: true });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
process.on('SIGINT', () => child.kill());
