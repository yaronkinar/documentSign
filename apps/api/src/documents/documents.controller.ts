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
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { ConfirmUploadDto, CreateDocumentDto, UpdateDocumentDto, UpdateFormValuesDto } from './documents.dto';
import { WorkflowService } from '../workflow/workflow.service';
import { InvitesService } from '../invites/invites.service';
import { AddSignerDto, AddStepDto } from '../workflow/workflow.dto';
import { toDocumentDto } from './documents.mapper';
import { SignatureFieldsService } from './signature-fields.service';
import { CreateSignatureFieldDto } from './signature-fields.dto';

@Controller('documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly workflowService: WorkflowService,
    private readonly invitesService: InvitesService,
    private readonly signatureFieldsService: SignatureFieldsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDocumentDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    if (dto.formTemplateId) {
      return this.documentsService.createFromTemplate(
        user.clerkId,
        user.email,
        dto,
      );
    }
    return this.documentsService.createUpload(user.clerkId, user.email, dto);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.documentsService.confirmUpload(id, user.clerkId, user.email, dto);
  }

  @Post(':id/summarize')
  summarize(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documentsService.summarizeDocument(id, user.clerkId);
  }

  @Post(':id/extract-signers')
  extractSigners(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documentsService.extractSigners(id, user.clerkId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.updateDocument(id, user.clerkId, dto);
  }

  @Patch(':id/form-values')
  updateFormValues(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateFormValuesDto,
  ) {
    return this.documentsService.updateFormValues(id, user.clerkId, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.documentsService.listDocuments(user.clerkId, user.email);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.documentsService.getDocument(id, user.clerkId, user.email);
  }

  @Get(':id/rendered.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  async renderHaknasot(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const bytes = await this.documentsService.renderHaknasotDocument(
      id,
      user.clerkId,
      user.email,
    );
    return new StreamableFile(bytes);
  }

  @Get(':id/download.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  async downloadPdf(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const bytes = await this.documentsService.downloadDocumentPdf(
      id,
      user.clerkId,
      user.email,
    );
    return new StreamableFile(bytes);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    await this.documentsService.deleteDocument(id, user.clerkId, user.email);
    return { ok: true };
  }

  @Patch(':id/submit')
  async submit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const doc = await this.workflowService.submitDocument(id, user.clerkId, user.email);
    return toDocumentDto(doc);
  }

  @Post(':id/dev/sign-all')
  devSignAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { imageKeys?: Record<string, string> },
  ) {
    return this.documentsService.devSignAll(id, user.clerkId, body?.imageKeys);
  }

  @Post(':id/steps')
  async addStep(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AddStepDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const doc = await this.workflowService.addStep(id, dto, user.clerkId, user.email);
    return toDocumentDto(doc);
  }

  @Post(':id/steps/:stepId/signers')
  async addSigner(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: AddSignerDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const doc = await this.workflowService.addSigner(
      id,
      stepId,
      dto,
      user.clerkId,
      user.email,
    );
    return toDocumentDto(doc);
  }

  @Post(':id/steps/:stepId/signers/:signerId/resend')
  async resend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Param('signerId') signerId: string,
    @Query('email') email?: string,
  ) {
    await this.invitesService.resendInvite(
      id,
      stepId,
      signerId,
      user.clerkId,
      email,
    );
    return { ok: true };
  }

  @Patch(':id/steps/:stepId/signers/:signerId/skip')
  async skip(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Param('signerId') signerId: string,
    @Query('email') email?: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    await this.workflowService.skipSigner(
      id,
      stepId,
      signerId,
      user.clerkId,
      user.email,
      email,
    );
    return { ok: true };
  }

  @Get(':id/signature-fields')
  listSignatureFields(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.signatureFieldsService.listFields(id, user.clerkId, user.email);
  }

  @Post(':id/signature-fields')
  createSignatureField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateSignatureFieldDto,
  ) {
    return this.signatureFieldsService.createField(id, dto, user.clerkId);
  }

  @Delete(':id/signature-fields/:fieldId')
  async deleteSignatureField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.signatureFieldsService.deleteField(id, fieldId, user.clerkId);
    return { ok: true };
  }
}
