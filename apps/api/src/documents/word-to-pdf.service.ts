import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { promisify } from 'node:util';
import libre from 'libreoffice-convert';

const convertAsync = promisify(libre.convert);

const MAX_WORD_BYTES = 25 * 1024 * 1024;

@Injectable()
export class WordToPdfService {
  async convert(buffer: Buffer, extension: '.doc' | '.docx'): Promise<Buffer> {
    if (buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }
    if (buffer.length > MAX_WORD_BYTES) {
      throw new BadRequestException('File too large (max 25 MB)');
    }

    try {
      const pdf = await convertAsync(buffer, extension, undefined);
      if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
        throw new Error('Conversion produced an empty PDF');
      }
      return pdf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('soffice') ||
        message.includes('ENOENT') ||
        message.includes('spawn')
      ) {
        throw new ServiceUnavailableException(
          'Word document conversion is not available on this server.',
        );
      }
      throw new BadRequestException('Failed to convert document to PDF');
    }
  }
}
