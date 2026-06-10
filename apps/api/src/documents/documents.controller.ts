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

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';
import { WordToPdfService } from './word-to-pdf.service';
import {
  AttachFormTemplateDto,
  ConfirmUploadDto,
  CreateDocumentDto,
  CreateDocumentFormFieldDto,
  UpdateDocumentDto,
  UpdateDocumentFormFieldDto,
  UpdateFormValuesDto,
} from './documents.dto';
import { WorkflowService } from '../workflow/workflow.service';
import { InvitesService } from '../invites/invites.service';
import { TemplatesService } from '../templates/templates.service';
import { CreateTemplateFromDocumentDto } from '../templates/templates.dto';
import { AddSignerDto, AddStepDto } from '../workflow/workflow.dto';
import { toDocumentDto } from './documents.mapper';
import { SignatureFieldsService } from './signature-fields.service';
import {
  CreateSignatureFieldDto,
  UpdateSignatureFieldDto,
} from './signature-fields.dto';

interface UploadedWordFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly workflowService: WorkflowService,
    private readonly invitesService: InvitesService,
    private readonly signatureFieldsService: SignatureFieldsService,
    private readonly templatesService: TemplatesService,
    private readonly wordToPdfService: WordToPdfService,
  ) {}

  @Post('convert-to-pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  async convertToPdf(@UploadedFile() file: UploadedWordFile | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    const name = file.originalname.toLowerCase();
    const ext = name.endsWith('.docx')
      ? '.docx'
      : name.endsWith('.doc')
        ? '.doc'
        : file.mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ? '.docx'
          : file.mimetype === 'application/msword'
            ? '.doc'
            : null;
    if (!ext) {
      throw new BadRequestException('Only .doc and .docx files are supported');
    }
    const pdf = await this.wordToPdfService.convert(file.buffer, ext);
    return new StreamableFile(pdf);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateDocumentDto,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    if (dto.formTemplateId && dto.pdfTemplateId) {
      throw new BadRequestException(
        'Use either formTemplateId or pdfTemplateId, not both',
      );
    }
    if (dto.formTemplateId) {
      return this.documentsService.createFromTemplate(
        user.clerkId,
        user.email,
        dto,
      );
    }
    if (dto.pdfTemplateId) {
      return this.documentsService.createFromPdfTemplate(
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

  @Post(':id/extract-form-fields')
  extractFormFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documentsService.extractFormFields(id, user.clerkId);
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

  @Patch(':id/form-template')
  attachFormTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AttachFormTemplateDto,
  ) {
    return this.documentsService.attachFormTemplate(id, user.clerkId, dto);
  }

  @Post(':id/form-fields')
  addFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateDocumentFormFieldDto,
  ) {
    return this.documentsService.addFormField(id, user.clerkId, dto);
  }

  @Patch(':id/form-fields/:fieldId')
  updateFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateDocumentFormFieldDto,
  ) {
    return this.documentsService.updateFormField(
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
    return this.documentsService.deleteFormField(id, user.clerkId, fieldId);
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

  @Get(':id/source.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  async sourcePdf(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const bytes = await this.documentsService.getDocumentSourcePdf(
      id,
      user.clerkId,
      user.email,
    );
    return new StreamableFile(bytes);
  }

  @Get(':id/rendered.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'no-store')
  async renderDocumentPdf(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    const bytes = await this.documentsService.renderDocumentPdf(
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

  @Post(':id/save-as-template')
  async saveAsTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateTemplateFromDocumentDto,
  ) {
    return this.templatesService.createFromDocument(id, user.clerkId, dto);
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

  @Patch(':id/signature-fields/:fieldId')
  updateSignatureField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateSignatureFieldDto,
  ) {
    return this.signatureFieldsService.updateField(
      id,
      fieldId,
      dto,
      user.clerkId,
    );
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
