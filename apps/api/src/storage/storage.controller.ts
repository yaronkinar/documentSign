import {
  Controller,
  Get,
  InternalServerErrorException,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LocalStorageBackend } from './local-storage.backend';
import { verifyStorageToken } from './storage.tokens';

function isLocalDriver(): boolean {
  return (process.env.STORAGE_DRIVER ?? 'supabase').toLowerCase() === 'local';
}

@Controller('storage/local')
export class StorageController {
  private readonly local = new LocalStorageBackend();

  @Put('upload')
  async upload(@Query('token') token: string, @Req() req: Request): Promise<{ ok: true }> {
    if (!isLocalDriver()) {
      throw new InternalServerErrorException('Local storage is not enabled');
    }
    const key = verifyStorageToken(token, 'upload');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new InternalServerErrorException('[storage] empty upload body');
    }
    await this.local.writeRawUpload(key, body);
    return { ok: true };
  }

  @Get('download')
  async download(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isLocalDriver()) {
      throw new InternalServerErrorException('Local storage is not enabled');
    }
    const key = verifyStorageToken(token, 'download');
    const data = await this.local.downloadObject(key);
    res.setHeader(
      'Content-Type',
      key.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(data);
  }
}
