import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuditEventType, HEBREW_SAMPLE_DEFAULT_TITLE, HAKNASOT_FORM_TEMPLATE_ID, MUNICIPAL_APPROVAL_SIGNER_TITLES, type DocumentDto } from '@docflow/shared';

import { Document, DocumentDocument } from './document.schema';
import { Signature, SignatureDocument } from '../signatures/signature.schema';
import { Comment, CommentDocument } from '../comments/comment.schema';
import {
  AuditEvent,
  AuditEventDocument,
} from '../audit/audit-event.schema';
import { InvitesService } from '../invites/invites.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { ConfirmUploadDto, CreateDocumentDto, UpdateDocumentDto, UpdateFormValuesDto } from './documents.dto';
import { toDocumentDto } from './documents.mapper';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    @InjectModel(Signature.name)
    private readonly signatureModel: Model<SignatureDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    private readonly invitesService: InvitesService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
  ) {}

  async createFromTemplate(
    clerkId: string,
    actorEmail: string,
    dto: CreateDocumentDto,
  ): Promise<DocumentDto> {
    const templateId = dto.formTemplateId!;
    if (templateId !== HAKNASOT_FORM_TEMPLATE_ID) {
      throw new BadRequestException(`Unknown form template: ${templateId}`);
    }

    const documentId = new Types.ObjectId();
    const doc = new this.documentModel({
      _id: documentId,
      title: dto.title,
      description: dto.description ?? null,
      fileKey: null,
      fileSize: null,
      pageCount: 2,
      formTemplateId: templateId,
      formValues: {},
      ownerId: clerkId,
      status: 'draft',
      currentStep: 0,
      workflowSteps: [],
      participantEmails: [actorEmail.toLowerCase()],
      participantClerkIds: [clerkId],
    });
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.DocumentCreated,
      metadata: { title: dto.title, formTemplateId: templateId },
    });

    return toDocumentDto(doc);
  }

  async createUpload(
    clerkId: string,
    actorEmail: string,
    dto: CreateDocumentDto,
  ): Promise<{ uploadUrl: string; documentId: string; fileKey: string }> {
    const documentId = new Types.ObjectId();
    const fileKey = `docs/${documentId.toString()}/${uuidv4()}.pdf`;

    const doc = new this.documentModel({
      _id: documentId,
      title: dto.title,
      description: dto.description ?? null,
      fileKey,
      ownerId: clerkId,
      status: 'draft',
      currentStep: 0,
      workflowSteps: [],
      participantEmails: [actorEmail.toLowerCase()],
      participantClerkIds: [clerkId],
    });
    await doc.save();

    const uploadUrl = await this.storageService.getUploadUrl(fileKey, 'application/pdf');

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.DocumentCreated,
      metadata: { title: dto.title },
    });

    return { uploadUrl, documentId: documentId.toString(), fileKey };
  }

  async confirmUpload(
    documentId: string,
    clerkId: string,
    actorEmail: string,
    dto: ConfirmUploadDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    doc.fileSize = dto.fileSize;
    doc.pageCount = dto.pageCount;
    if (this.shouldUseHaknasotTemplate(doc.title)) {
      doc.formTemplateId = HAKNASOT_FORM_TEMPLATE_ID;
    }
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.DocumentUploaded,
      metadata: { fileSize: dto.fileSize, pageCount: dto.pageCount },
    });

    return toDocumentDto(doc);
  }

  async summarizeDocument(
    documentId: string,
    clerkId: string,
  ): Promise<{ summary: string }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.description?.trim()) {
      return { summary: doc.description };
    }
    if (!doc.fileKey) {
      if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
        return {
          summary: 'טופס הכנסות – אישור והרחבת חוזה עירוני',
        };
      }
      throw new BadRequestException('Document has no PDF to summarize');
    }
    const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
    const text = await this.aiService.extractPdfText(pdfBuffer);
    const summary = await this.aiService.summarizeDocumentText(text, doc.title);
    doc.description = summary;
    await doc.save();
    return { summary };
  }

  async extractSigners(
    documentId: string,
    clerkId: string,
  ): Promise<{ signers: string[] }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (!doc.fileKey) {
      if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
        return { signers: [...MUNICIPAL_APPROVAL_SIGNER_TITLES] };
      }
      return { signers: [] };
    }
    const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
    const text = await this.aiService.extractPdfText(pdfBuffer);
    const signers = await this.aiService.extractSignerRoles(text);
    return { signers };
  }

  async updateDocument(
    documentId: string,
    clerkId: string,
    dto: UpdateDocumentDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (dto.title !== undefined) {
      doc.title = dto.title;
      if (this.shouldUseHaknasotTemplate(dto.title) && !doc.formTemplateId) {
        doc.formTemplateId = HAKNASOT_FORM_TEMPLATE_ID;
      }
    }
    if (dto.description !== undefined) doc.description = dto.description;
    await doc.save();
    return toDocumentDto(doc);
  }

  async updateFormValues(
    documentId: string,
    clerkId: string,
    dto: UpdateFormValuesDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.status !== 'draft') {
      throw new ForbiddenException('Form values can only be edited in draft');
    }
    if (!doc.formTemplateId) {
      throw new ForbiddenException('Document has no form template');
    }

    const allowed = new Set(
      Object.keys(dto.values).filter((key) => typeof dto.values[key] === 'string'),
    );
    doc.formValues = {
      ...(doc.formValues ?? {}),
      ...Object.fromEntries(
        [...allowed].map((key) => [key, dto.values[key]!.slice(0, 2000)]),
      ),
    };
    doc.markModified('formValues');
    await doc.save();
    return toDocumentDto(doc);
  }

  async listDocuments(clerkId: string, email: string): Promise<DocumentDto[]> {
    const docs = await this.documentModel
      .find({
        $or: [
          { participantClerkIds: clerkId },
          { participantEmails: email.toLowerCase() },
        ],
      })
      .sort({ updatedAt: -1 })
      .exec();
    return docs.map((d) => toDocumentDto(d));
  }

  async getDocument(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<DocumentDto> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();

    let fileUrl: string | undefined;
    if (doc.fileKey) {
      try {
        fileUrl = await this.storageService.getDownloadUrl(doc.fileKey);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[documents] failed to sign PDF download URL', err);
      }
    }

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail: email,
      eventType: AuditEventType.DocumentViewed,
    });
    return toDocumentDto(doc, fileUrl ? { fileUrl } : undefined);
  }

  async deleteDocument(
    documentId: string,
    clerkId: string,
    actorEmail: string,
  ): Promise<void> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    const id = doc._id;
    const fileKey = doc.fileKey;
    const completedFileKey = doc.completedFileKey;

    const sigs = await this.signatureModel.find({ documentId: id }).exec();

    // Delete storage objects (best-effort, non-blocking)
    if (fileKey) {
      this.storageService.deleteObject(fileKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[documents] storage delete pdf failed', err);
      });
    }
    if (completedFileKey) {
      this.storageService.deleteObject(completedFileKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[documents] storage delete completed pdf failed', err);
      });
    }
    for (const sig of sigs) {
      this.storageService.deleteObject(sig.imageKey).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[documents] storage delete sig failed', err);
      });
    }

    this.auditService.log({
      documentId: id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.DocumentDeleted,
    });

    await Promise.all([
      this.signatureModel.deleteMany({ documentId: id }).exec(),
      this.commentModel.deleteMany({ documentId: id }).exec(),
      this.documentModel.deleteOne({ _id: id }).exec(),
    ]);
  }

  /**
   * When a Clerk user's primary email changes, keep document participant lists
   * and workflow signer addresses in sync.
   */
  async propagateParticipantEmailChange(
    clerkId: string,
    oldEmail: string,
    newEmail: string,
  ): Promise<void> {
    const old = oldEmail.toLowerCase();
    const neu = newEmail.toLowerCase();
    if (!old || !neu || old === neu) return;

    const docs = await this.documentModel
      .find({
        $or: [
          { participantEmails: old },
          { participantClerkIds: clerkId },
          { 'workflowSteps.signers.email': old },
          { 'workflowSteps.signers.clerkId': clerkId },
        ],
      })
      .exec();

    for (const doc of docs) {
      let changed = false;

      const oldIdx = doc.participantEmails.indexOf(old);
      if (oldIdx !== -1) {
        doc.participantEmails.splice(oldIdx, 1);
        changed = true;
      }
      if (
        doc.participantClerkIds.includes(clerkId) &&
        !doc.participantEmails.includes(neu)
      ) {
        doc.participantEmails.push(neu);
        changed = true;
      }

      for (const step of doc.workflowSteps) {
        for (const signer of step.signers) {
          if (signer.clerkId === clerkId || signer.email === old) {
            if (signer.email !== neu) {
              signer.email = neu;
              changed = true;
            }
            if (clerkId && signer.clerkId !== clerkId) {
              signer.clerkId = clerkId;
              changed = true;
            }
          }
        }
      }

      if (changed) await doc.save();
    }

    await this.signatureModel
      .updateMany({ signerEmail: old }, { $set: { signerEmail: neu } })
      .exec();

    await this.commentModel
      .updateMany(
        { authorId: clerkId, authorEmail: old },
        { $set: { authorEmail: neu } },
      )
      .exec();

    await this.invitesService.refreshInvitesAfterEmailChange(clerkId, neu);
  }

  private shouldUseHaknasotTemplate(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    return (
      title.trim() === HEBREW_SAMPLE_DEFAULT_TITLE ||
      normalized.includes('haknasot') ||
      normalized.includes('הכנסות')
    );
  }

  private async findOwnedDocument(
    documentId: string,
    clerkId: string,
  ): Promise<DocumentDocument> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== clerkId) throw new ForbiddenException('Not the owner');
    return doc;
  }
}
