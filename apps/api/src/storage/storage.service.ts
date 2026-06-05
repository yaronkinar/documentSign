import { Injectable } from '@nestjs/common';
import { LocalStorageBackend } from './local-storage.backend';
import { SupabaseStorageBackend } from './supabase-storage.backend';

/**
 * Storage facade — Supabase (production) or local filesystem (dev).
 *
 * Key naming conventions (used throughout the app - do not deviate):
 *   - PDF uploads:                docs/{documentId}/{uuid}.pdf
 *   - Template PDFs:              templates/{templateId}/{uuid}.pdf
 *   - User saved signatures:      sigs/users/{userId}/{sigId}.png
 *   - Signer profile signatures:  sigs/profiles/{profileId}.png
 *   - Document placed signatures: sigs/docs/{documentId}/{sigId}.png
 *   - Completed merged PDFs:      completed/{documentId}/final.pdf
 */
@Injectable()
export class StorageService {
  private readonly backend: LocalStorageBackend | SupabaseStorageBackend;

  constructor() {
    const driver = (process.env.STORAGE_DRIVER ?? 'supabase').toLowerCase();
    this.backend =
      driver === 'local' ? new LocalStorageBackend() : new SupabaseStorageBackend();
    if (driver === 'local') {
      // eslint-disable-next-line no-console
      console.log('[storage] using local filesystem driver');
    }
  }

  getUploadUrl(key: string, contentType: string): Promise<string> {
    return this.backend.getUploadUrl(key, contentType);
  }

  getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    return this.backend.getDownloadUrl(key, expiresIn);
  }

  downloadObject(key: string): Promise<Buffer> {
    return this.backend.downloadObject(key);
  }

  uploadBuffer(key: string, data: Buffer, contentType: string): Promise<void> {
    return this.backend.uploadBuffer(key, data, contentType);
  }

  deleteObject(key: string): Promise<void> {
    return this.backend.deleteObject(key);
  }
}
