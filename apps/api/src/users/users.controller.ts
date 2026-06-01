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

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private ensureUser(user: CurrentUserPayload) {
    return this.usersService.findOrCreateFromAuth({
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
    });
  }

  @Get('search')
  async search(@Query('q') q: string) {
    return this.usersService.searchUsers(q ?? '');
  }

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload) {
    const u = await this.ensureUser(user);
    return {
      _id: u._id.toString(),
      clerkId: u.clerkId,
      email: u.email,
      name: u.name ?? null,
      avatarUrl: u.avatarUrl ?? null,
      role: u.role,
    };
  }

  @Get('me/signatures')
  async listSignatures(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SavedSignatureDto[]> {
    await this.ensureUser(user);
    return this.usersService.listSavedSignatures(user.clerkId);
  }

  @Post('me/signatures/upload-url')
  async uploadUrl(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: GetSignatureUploadUrlDto,
  ) {
    await this.ensureUser(user);
    return this.usersService.getSignatureUploadUrl(user.clerkId, dto);
  }

  @Post('me/signatures/confirm')
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ConfirmSavedSignatureDto & { imageKey: string },
  ): Promise<SavedSignatureDto[]> {
    await this.ensureUser(user);
    await this.usersService.confirmSavedSignature(user.clerkId, body.imageKey, body);
    return this.usersService.listSavedSignatures(user.clerkId);
  }

  @Patch('me/signatures/:id/default')
  async setDefault(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.ensureUser(user);
    await this.usersService.setDefaultSignature(user.clerkId, id);
    return { ok: true };
  }

  @Patch('me/signatures/:id')
  async updateLabel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSignatureLabelDto,
  ) {
    await this.ensureUser(user);
    await this.usersService.updateSignatureLabel(user.clerkId, id, dto.label);
    return { ok: true };
  }

  @Delete('me/signatures/:id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.ensureUser(user);
    await this.usersService.deleteSavedSignature(user.clerkId, id);
    return { ok: true };
  }
}
