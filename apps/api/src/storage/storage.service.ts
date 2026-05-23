import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Storage wrapper (service-role client on the API).
 *
 * Key naming conventions (used throughout the app - do not deviate):
 *   - PDF uploads:                docs/{documentId}/{uuid}.pdf
 *   - User saved signatures:      sigs/users/{userId}/{sigId}.png
 *   - Signer profile signatures:  sigs/profiles/{profileId}.png
 *   - Document placed signatures: sigs/docs/{documentId}/{sigId}.png
 *   - Completed merged PDFs:      completed/{documentId}/final.pdf
 *
 * Raw keys must NEVER be returned to clients - always swap for a signed URL.
 */
@Injectable()
export class StorageService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'docflow-files';

    if (!url || !serviceRoleKey) {
      throw new Error(
        '[storage] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env',
      );
    }
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = bucket;
  }

  /** Signed PUT URL. Default TTL 15min. Client uploads body directly. */
  async getUploadUrl(key: string, _contentType: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(key);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `[storage] failed to create upload URL: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data.signedUrl;
  }

  /** Signed GET URL. Default TTL 15min. */
  async getDownloadUrl(key: string, expiresIn = 15 * 60): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresIn);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException(
        `[storage] failed to create download URL: ${error?.message ?? 'unknown error'}`,
      );
    }

    return data.signedUrl;
  }

  async downloadObject(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) {
      throw new InternalServerErrorException(
        `[storage] failed to download object: ${error?.message ?? 'unknown error'}`,
      );
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) {
      throw new InternalServerErrorException(
        `[storage] failed to delete object: ${error.message}`,
      );
    }
  }
}
