import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../../src/domain/types';
import { deserialize, MAX_FILE_BYTES, serialize } from '../../src/services/serialization';
export async function atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temp, 'wx');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, target);
  } catch (e) {
    await fs.unlink(temp).catch(() => {});
    throw e;
  }
}
export async function readProject(target: string) {
  if (!['.json', '.dimeline'].includes(path.extname(target).toLowerCase()))
    throw new Error('请选择 .json 或 .dimeline 项目文件');
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('项目不是普通文件或超过 10 MB');
  return deserialize(await fs.readFile(target, 'utf8'));
}
export async function writeProject(target: string, project: Project): Promise<void> {
  const text = serialize(project);
  deserialize(text);
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('项目超过 10 MB，无法保存');
  await atomicWrite(target, text);
}
