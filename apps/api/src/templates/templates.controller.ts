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

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { TemplatesService } from './templates.service';
import {
  ConfirmTemplateUploadDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './templates.dto';

@Controller('templates')
@UseGuards(ClerkAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateTemplateDto) {
    return this.templatesService.createUpload(user.clerkId, dto);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmTemplateUploadDto,
  ) {
    return this.templatesService.confirmUpload(id, user.clerkId, dto);
  }

  @Post(':id/extract-fields')
  extractFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.extractFields(id, user.clerkId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.templatesService.listTemplates(user.clerkId);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.getTemplate(id, user.clerkId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.updateTemplate(id, user.clerkId, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.templatesService.deleteTemplate(id, user.clerkId);
    return { ok: true };
  }
}
