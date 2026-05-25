import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import type { PdfTemplateDto } from '@docflow/shared';

import { PdfTemplate, PdfTemplateDocument } from './template.schema';
import { StorageService } from '../storage/storage.service';
import { AiService, type ExtractedTemplateField } from '../ai/ai.service';
import { SignerProfile, SignerProfileDocument } from '../signer-profiles/signer-profile.schema';
import {
  ConfirmTemplateUploadDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './templates.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(PdfTemplate.name)
    private readonly templateModel: Model<PdfTemplateDocument>,
    @InjectModel(SignerProfile.name)
    private readonly signerProfileModel: Model<SignerProfileDocument>,
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
    const signerHints = await this.getSignerHints(clerkId);
    const fields = await this.aiService.extractTemplateFieldsFromPdf(
      pdfBuffer,
      template.pageCount,
      signerHints,
    );
    return { fields };
  }

  async deleteTemplate(id: string, clerkId: string): Promise<void> {
    const template = await this.requireOwner(id, clerkId);
    if (template.fileKey) {
      await this.storageService.deleteObject(template.fileKey).catch(() => {});
    }
    await template.deleteOne();
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

  private async getSignerHints(
    clerkId: string,
  ): Promise<Array<{ label: string; email?: string | null }>> {
    const profiles = await this.signerProfileModel
      .find({ ownerId: clerkId })
      .select('title name email')
      .sort({ title: 1, name: 1 })
      .lean()
      .exec();

    const seen = new Set<string>();
    return profiles.flatMap((profile) => {
      const labels = [profile.title, profile.name].filter(
        (label): label is string =>
          typeof label === 'string' && label.trim().length > 0 && label.trim() !== '—',
      );
      return labels.flatMap((label) => {
        const trimmed = label.trim();
        const key = `${trimmed.toLowerCase()}:${profile.email ?? ''}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ label: trimmed, email: profile.email ?? null }];
      });
    });
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
