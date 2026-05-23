import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SignerProfileDto } from '@docflow/shared';

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
  list(@CurrentUser() user: CurrentUserPayload): Promise<SignerProfileDto[]> {
    return this.signerProfilesService.list(user.clerkId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSignerProfileDto,
  ): Promise<SignerProfileDto> {
    return this.signerProfilesService.create(user.clerkId, dto);
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
