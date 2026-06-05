import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageBackend {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'docflow-files';

    if (!url || !serviceRoleKey) {
      throw new Error(
        '[storage] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set when STORAGE_DRIVER=supabase',
      );
    }
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = bucket;
  }

  async getUploadUrl(key: string, _contentType: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(key);

    if (error || !data?.signedUrl) {
      const detail = error?.message ?? 'unknown error';
      throw new InternalServerErrorException(
        `[storage] failed to create upload URL: ${detail}. ` +
          'If using Supabase, check that the project database is healthy (Storage error 544 = DB timeout). ' +
          'For local dev, set STORAGE_DRIVER=local in .env.',
      );
    }

    return data.signedUrl;
  }

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

  async uploadBuffer(key: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, data, { contentType, upsert: true });
    if (error) {
      throw new InternalServerErrorException(
        `[storage] upload failed: ${error.message}`,
      );
    }
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
