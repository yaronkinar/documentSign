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
  CreateTemplateFormFieldDto,
  UpdateTemplateDto,
  UpdateTemplateFormFieldDto,
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

  @Post(':id/extract-form-fields')
  extractFormFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.extractFormFields(id, user.clerkId);
  }

  @Post(':id/form-fields')
  addFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateTemplateFormFieldDto,
  ) {
    return this.templatesService.addFormField(id, user.clerkId, dto);
  }

  @Patch(':id/form-fields/:fieldId')
  updateFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateTemplateFormFieldDto,
  ) {
    return this.templatesService.updateFormField(
      id,
      user.clerkId,
      fieldId,
      dto,
    );
  }

  @Delete(':id/form-fields/:fieldId')
  deleteFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.templatesService.deleteFormField(id, user.clerkId, fieldId);
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
