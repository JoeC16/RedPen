import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage } from "./index";

// Relative keys only: letters, digits, / _ . -, never starting with / or containing "..".
const KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,299}$/;

/** Development and test driver: files under a local folder. Not for production. */
export class LocalStorage implements ObjectStorage {
  private readonly root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }
  private file(key: string): string {
    if (!KEY.test(key) || key.includes("..")) throw new Error("invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer, _contentType?: string): Promise<void> {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes, { mode: 0o600 });
  }
  async get(key: string): Promise<Buffer> {
    return readFile(this.file(key));
  }
  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
}
