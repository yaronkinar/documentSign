import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { PdfTemplateDto } from '@docflow/shared';

import { PdfTemplate, PdfTemplateDocument } from './template.schema';
import { Document, DocumentDocument } from '../documents/document.schema';
import { StorageService } from '../storage/storage.service';
import { AiService, type ExtractedTemplateField } from '../ai/ai.service';
import {
  ConfirmTemplateUploadDto,
  CreateTemplateDto,
  CreateTemplateFromDocumentDto,
  UpdateTemplateDto,
} from './templates.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(PdfTemplate.name)
    private readonly templateModel: Model<PdfTemplateDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    private readonly storageService: StorageService,
    private readonly aiService: AiService,
  ) {}

  async createUpload(
    clerkId: string,
    dto: CreateTemplateDto,
  ): Promise<{ uploadUrl: string; templateId: string; fileKey: string }> {
    const templateId = new Types.ObjectId();
    const fileKey = `templates/${templateId}/${uuidv4()}.pdf`;

    const template = new this.templateModel({
      _id: templateId,
      name: dto.name,
      ownerId: clerkId,
      fileKey,
      isDefault: false,
      fields: [],
    });
    await template.save();

    const uploadUrl = await this.storageService.getUploadUrl(fileKey, 'application/pdf');
    return { uploadUrl, templateId: templateId.toString(), fileKey };
  }

  async confirmUpload(
    id: string,
    clerkId: string,
    dto: ConfirmTemplateUploadDto,
  ): Promise<PdfTemplateDto> {
    const template = await this.requireOwner(id, clerkId);
    template.fileSize = dto.fileSize;
    if (dto.pageCount != null) template.pageCount = dto.pageCount;
    await template.save();
    return this.toDto(template);
  }

  async listTemplates(clerkId: string): Promise<PdfTemplateDto[]> {
    const templates = await this.templateModel
      .find({ ownerId: clerkId })
      .sort({ createdAt: -1 });
    return Promise.all(templates.map((t) => this.toDto(t)));
  }

  async getTemplate(id: string, clerkId: string): Promise<PdfTemplateDto> {
    const template = await this.requireOwner(id, clerkId);
    return this.toDto(template);
  }

  /** Download template PDF bytes for copying into a new document. */
  async readTemplatePdf(
    id: string,
    clerkId: string,
  ): Promise<{
    buffer: Buffer;
    fileSize: number;
    pageCount: number | null;
    name: string;
  }> {
    const template = await this.requireOwner(id, clerkId);
    if (!template.fileKey) {
      throw new BadRequestException('Template PDF has not been uploaded yet');
    }
    const buffer = await this.storageService.downloadObject(template.fileKey);
    return {
      buffer,
      fileSize: template.fileSize ?? buffer.length,
      pageCount: template.pageCount ?? null,
      name: template.name,
    };
  }

  async updateTemplate(
    id: string,
    clerkId: string,
    dto: UpdateTemplateDto,
  ): Promise<PdfTemplateDto> {
    const template = await this.requireOwner(id, clerkId);

    if (dto.name !== undefined) template.name = dto.name;

    if (dto.fields !== undefined) {
      template.fields = dto.fields.map((f) => ({
        _id: new Types.ObjectId(),
        label: f.label,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })) as any;
    }

    if (dto.isDefault === true) {
      await this.templateModel.updateMany(
        { ownerId: clerkId, _id: { $ne: template._id } },
        { $set: { isDefault: false } },
      );
      template.isDefault = true;
    } else if (dto.isDefault === false) {
      template.isDefault = false;
    }

    await template.save();
    return this.toDto(template);
  }

  async extractFields(
    id: string,
    clerkId: string,
  ): Promise<{ fields: ExtractedTemplateField[] }> {
    const template = await this.requireOwner(id, clerkId);
    if (!template.fileKey) {
      throw new NotFoundException('Template PDF not found');
    }

    const pdfBuffer = await this.storageService.downloadObject(template.fileKey);
    let fields: ExtractedTemplateField[] = [];
    try {
      const pdfText = await this.aiService.extractPdfText(pdfBuffer);
      const rolesFromPdf = await this.aiService.extractSignerRoles(pdfText);
      const signerHints = rolesFromPdf.map((label) => ({ label }));
      fields = await this.aiService.extractTemplateFieldsFromPdf(
        pdfBuffer,
        template.pageCount,
        signerHints,
        'uploaded_document',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const visionUnavailable =
        message.includes('OPENAI_API_KEY') ||
        message.includes('not configured');
      if (!visionUnavailable) throw err;
    }
    if (fields.length === 0) {
      fields = await this.aiService.deriveTemplateFieldsFromPdf(pdfBuffer);
    }
    return { fields };
  }

  /** Copy document PDF + placed signature fields into a reusable PDF template. */
  async createFromDocument(
    documentId: string,
    clerkId: string,
    dto: CreateTemplateFromDocumentDto,
  ): Promise<PdfTemplateDto> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== clerkId) throw new ForbiddenException();

    const sourceKey = doc.fileKey ?? doc.completedFileKey;
    if (!sourceKey) {
      throw new BadRequestException(
        'Document has no PDF file to save as a template',
      );
    }

    const signatureFields = doc.signatureFields ?? [];
    if (signatureFields.length === 0) {
      throw new BadRequestException(
        'Place at least one signature field before saving as a template',
      );
    }

    const pdfBuffer = await this.storageService.downloadObject(sourceKey);
    const templateId = new Types.ObjectId();
    const fileKey = `templates/${templateId}/${uuidv4()}.pdf`;
    await this.storageService.uploadBuffer(fileKey, pdfBuffer, 'application/pdf');

    const usedLabels = new Map<string, number>();
    const templateFields = signatureFields.map((field) => {
      const label = this.resolveSignatureFieldLabel(doc, field, usedLabels);
      return {
        _id: new Types.ObjectId(),
        label,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      };
    });

    const template = new this.templateModel({
      _id: templateId,
      name: dto.name.trim(),
      ownerId: clerkId,
      fileKey,
      fileSize: pdfBuffer.length,
      pageCount: doc.pageCount,
      isDefault: false,
      fields: templateFields,
    });
    await template.save();
    return this.toDto(template);
  }

  async deleteTemplate(id: string, clerkId: string): Promise<void> {
    const template = await this.requireOwner(id, clerkId);
    if (template.fileKey) {
      await this.storageService.deleteObject(template.fileKey).catch(() => {});
    }
    await template.deleteOne();
  }

  private resolveSignatureFieldLabel(
    doc: DocumentDocument,
    field: DocumentDocument['signatureFields'][number],
    usedLabels: Map<string, number>,
  ): string {
    const step = doc.workflowSteps.id(field.stepId);
    const signer = step?.signers.id(field.signerId);
    const base = (field.label ?? signer?.name ?? signer?.email ?? 'Signer').trim();
    const count = (usedLabels.get(base) ?? 0) + 1;
    usedLabels.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  }

  private async requireOwner(
    id: string,
    clerkId: string,
  ): Promise<PdfTemplateDocument> {
    const template = await this.templateModel.findById(id);
    if (!template) throw new NotFoundException('Template not found');
    if (template.ownerId !== clerkId) throw new ForbiddenException();
    return template;
  }

  private async toDto(template: PdfTemplateDocument): Promise<PdfTemplateDto> {
    let fileUrl: string | null = null;
    if (template.fileKey) {
      fileUrl = await this.storageService.getDownloadUrl(template.fileKey);
    }
    return {
      _id: template._id.toString(),
      name: template.name,
      fileUrl,
      fileSize: template.fileSize,
      pageCount: template.pageCount,
      isDefault: template.isDefault,
      fields: template.fields.map((f) => ({
        _id: f._id.toString(),
        label: f.label,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
      createdAt: (template as any).createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: (template as any).updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
