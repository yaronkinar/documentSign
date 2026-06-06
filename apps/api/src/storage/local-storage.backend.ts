import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { access, mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { signStorageToken } from './storage.tokens';

const UPLOAD_TTL = 15 * 60;
const DOWNLOAD_TTL = 15 * 60;

@Injectable()
export class LocalStorageBackend {
  private readonly root: string;
  private readonly publicBase: string;

  constructor() {
    this.root = process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), '.local-storage');
    const port = process.env.PORT ?? '3001';
    this.publicBase =
      process.env.API_PUBLIC_URL?.replace(/\/$/, '') ?? `http://localhost:${port}`;
  }

  private resolvePath(key: string): string {
    const root = resolve(this.root);
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) {
      throw new InternalServerErrorException('[storage] invalid key path');
    }
    return full;
  }

  async getUploadUrl(key: string, _contentType: string): Promise<string> {
    const token = signStorageToken(key, 'upload', UPLOAD_TTL);
    return `${this.publicBase}/storage/local/upload?token=${encodeURIComponent(token)}`;
  }

  async getDownloadUrl(key: string, expiresIn = DOWNLOAD_TTL): Promise<string> {
    const token = signStorageToken(key, 'download', expiresIn);
    return `${this.publicBase}/storage/local/download?token=${encodeURIComponent(token)}`;
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async downloadObject(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolvePath(key));
    } catch {
      throw new InternalServerErrorException(
        `[storage] failed to download object: file not found`,
      );
    }
  }

  async uploadBuffer(key: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.resolvePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch {
      // ignore missing files
    }
  }

  async writeRawUpload(key: string, body: Buffer): Promise<void> {
    await this.uploadBuffer(key, body, 'application/octet-stream');
  }
}
