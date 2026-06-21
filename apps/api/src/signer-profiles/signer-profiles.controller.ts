import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ImportSignerProfilesResultDto, SignerProfileDto } from '@docflow/shared';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import {
  ConfirmProfileSignatureDto,
  CreateSignerProfileDto,
  UpdateSignerProfileDto,
} from './signer-profiles.dto';
import { SignerProfilesService } from './signer-profiles.service';

@Controller('signer-profiles')
@UseGuards(ClerkAuthGuard)
export class SignerProfilesController {
  constructor(private readonly signerProfilesService: SignerProfilesService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId?: string,
  ): Promise<SignerProfileDto[]> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    return this.signerProfilesService.list(user.clerkId, templateId.trim());
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSignerProfileDto,
  ): Promise<SignerProfileDto> {
    return this.signerProfilesService.create(user.clerkId, dto);
  }

  @Post('dedupe')
  dedupe(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId?: string,
  ): Promise<{ removed: number; profiles: SignerProfileDto[] }> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    return this.signerProfilesService.dedupe(user.clerkId, templateId.trim());
  }

  @Get('template.xlsx')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Cache-Control', 'no-store')
  async downloadTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId?: string,
  ): Promise<StreamableFile> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    const buffer = await this.signerProfilesService.buildTemplateWorkbook(
      user.clerkId,
      templateId.trim(),
    );
    return new StreamableFile(buffer);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  importFromExcel(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId: string | undefined,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ImportSignerProfilesResultDto> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    return this.signerProfilesService.importFromWorkbook(
      user.clerkId,
      templateId.trim(),
      file.buffer,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSignerProfileDto,
  ): Promise<SignerProfileDto> {
    return this.signerProfilesService.update(user.clerkId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.signerProfilesService.remove(user.clerkId, id);
    return { ok: true };
  }

  @Post(':id/signature/upload-url')
  uploadUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.signerProfilesService.getSignatureUploadUrl(user.clerkId, id);
  }

  @Post(':id/signature/confirm')
  confirmSignature(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmProfileSignatureDto,
  ): Promise<SignerProfileDto> {
    return this.signerProfilesService.confirmSignature(
      user.clerkId,
      id,
      dto.imageKey,
    );
  }

  @Delete(':id/signature')
  removeSignature(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<SignerProfileDto> {
    return this.signerProfilesService.removeSignature(user.clerkId, id);
  }
}
