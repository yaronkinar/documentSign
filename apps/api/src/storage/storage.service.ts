import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LocalStorageBackend } from './local-storage.backend';

/**
 * Storage facade — local filesystem.
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
  private readonly backend = new LocalStorageBackend();

  getUploadUrl(key: string, contentType: string): Promise<string> {
    return this.backend.getUploadUrl(key, contentType);
  }

  getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    return this.backend.getDownloadUrl(key, expiresIn);
  }

  /** Returns null when the object is missing instead of throwing. */
  async tryGetDownloadUrl(
    key: string,
    expiresIn?: number,
  ): Promise<string | null> {
    try {
      return await this.backend.getDownloadUrl(key, expiresIn);
    } catch (err) {
      if (StorageService.isMissingObjectError(err)) return null;
      throw err;
    }
  }

  objectExists(key: string): Promise<boolean> {
    return this.backend.objectExists(key);
  }

  private static isMissingObjectError(err: unknown): boolean {
    if (err instanceof NotFoundException) return true;
    const message =
      err instanceof InternalServerErrorException
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return /not found/i.test(message);
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
