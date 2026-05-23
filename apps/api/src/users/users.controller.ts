import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SavedSignatureDto } from '@docflow/shared';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import {
  ConfirmSavedSignatureDto,
  GetSignatureUploadUrlDto,
  UpdateSavedSignatureLabelDto,
} from './users.dto';

@Controller('users/me')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async me(@CurrentUser() user: CurrentUserPayload) {
    const u = await this.usersService.findByClerkId(user.clerkId);
    return {
      _id: u._id.toString(),
      clerkId: u.clerkId,
      email: u.email,
      name: u.name ?? null,
      avatarUrl: u.avatarUrl ?? null,
      role: u.role,
    };
  }

  @Get('signatures')
  listSignatures(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SavedSignatureDto[]> {
    return this.usersService.listSavedSignatures(user.clerkId);
  }

  @Post('signatures/upload-url')
  uploadUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: GetSignatureUploadUrlDto,
  ) {
    return this.usersService.getSignatureUploadUrl(user.clerkId, dto);
  }

  @Post('signatures/confirm')
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ConfirmSavedSignatureDto & { imageKey: string },
  ): Promise<SavedSignatureDto[]> {
    await this.usersService.confirmSavedSignature(user.clerkId, body.imageKey, body);
    return this.usersService.listSavedSignatures(user.clerkId);
  }

  @Patch('signatures/:id/default')
  async setDefault(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.usersService.setDefaultSignature(user.clerkId, id);
    return { ok: true };
  }

  @Patch('signatures/:id')
  async updateLabel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSignatureLabelDto,
  ) {
    await this.usersService.updateSignatureLabel(user.clerkId, id, dto.label);
    return { ok: true };
  }

  @Delete('signatures/:id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.usersService.deleteSavedSignature(user.clerkId, id);
    return { ok: true };
  }
}
