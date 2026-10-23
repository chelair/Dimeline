import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RecentFile } from '../../src/domain/types';
import { atomicWrite } from './fileService';
export class RecentFilesService {
  private files: RecentFile[] = [];
  constructor(private target: string) {}
  async init() {
    try {
      const value: unknown = JSON.parse(await fs.readFile(this.target, 'utf8'));
      if (Array.isArray(value))
        this.files = value
          .filter(
            (v): v is RecentFile =>
              typeof v?.path === 'string' &&
              typeof v?.name === 'string' &&
              typeof v?.time === 'string',
          )
          .slice(0, 20);
    } catch {
      /* Missing or invalid preferences must not block opening the editor. */
    }
  }
  list() {
    return this.files;
  }
  has(target: string) {
    return this.files.some((f) => f.path === target);
  }
  async add(target: string) {
    this.files = [
      { path: target, name: path.basename(target), time: new Date().toISOString() },
      ...this.files.filter((f) => f.path !== target),
    ].slice(0, 20);
    await atomicWrite(this.target, JSON.stringify(this.files));
  }
  async remove(target: string) {
    this.files = this.files.filter((f) => f.path !== target);
    await atomicWrite(this.target, JSON.stringify(this.files));
    return this.files;
  }
}
