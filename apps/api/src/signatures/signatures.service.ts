import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { SignatureDto, GuestSigningDataDto } from '@docflow/shared';

import { Signature, SignatureDocument } from './signature.schema';
import { Document, DocumentDocument } from '../documents/document.schema';
import { StorageService } from '../storage/storage.service';
import { WorkflowService } from '../workflow/workflow.service';
import { UsersService } from '../users/users.service';
import { PlaceSignatureDto } from './signatures.dto';
import { SignatureFieldsService } from '../documents/signature-fields.service';

export interface SignerContext {
  signerId: string | null;
  signerEmail: string;
  documentId: string;
  stepId: string;
  ipAddress: string | null;
  userAgent: string | null;
  actorName: string | null;
}

@Injectable()
export class SignaturesService {
  constructor(
    @InjectModel(Signature.name)
    private readonly signatureModel: Model<SignatureDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    private readonly storageService: StorageService,
    private readonly workflowService: WorkflowService,
    private readonly usersService: UsersService,
    private readonly signatureFieldsService: SignatureFieldsService,
  ) {}

  async getGuestUploadUrl(
    documentId: string,
    signerEmail: string,
  ): Promise<{ uploadUrl: string; imageKey: string }> {
    const sigId = new Types.ObjectId();
    const imageKey = `sigs/docs/${documentId}/${sigId.toString()}.png`;
    const uploadUrl = await this.storageService.getUploadUrl(imageKey, 'image/png');
    return { uploadUrl, imageKey };
  }

  async getRegisteredUploadUrl(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<{ uploadUrl: string; imageKey: string }> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();

    return this.getGuestUploadUrl(documentId, email);
  }

  async placeSignature(
    dto: PlaceSignatureDto,
    ctx: SignerContext,
  ): Promise<SignatureDto> {
    if (dto.documentId !== ctx.documentId) {
      throw new BadRequestException('Document mismatch');
    }
    if (dto.stepId !== ctx.stepId && ctx.stepId) {
      // For Clerk-auth path, ctx.stepId is null - we trust dto.stepId there.
      throw new BadRequestException('Step mismatch');
    }

    const doc = await this.documentModel.findById(dto.documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const step = doc.workflowSteps.id(dto.stepId);
    if (!step) throw new NotFoundException('Step not found');
    if (step.status !== 'in_progress') {
      throw new BadRequestException('Step is not active');
    }
    const signer = step.signers.find((s) => s.email === ctx.signerEmail);
    if (!signer) throw new ForbiddenException('Not a signer on this step');
    if (signer.status !== 'pending') {
      throw new BadRequestException('Already responded');
    }

    const assignedFields = (doc.signatureFields ?? []).filter(
      (f) =>
        String(f.stepId) === String(step._id) &&
        String(f.signerId) === String(signer._id),
    );

    let pageNumber = dto.pageNumber;
    let x = dto.x;
    let y = dto.y;
    let width = dto.width;
    let height = dto.height;
    let signatureFieldId: Types.ObjectId | null = null;

    if (assignedFields.length > 0) {
      if (!dto.signatureFieldId) {
        throw new BadRequestException(
          'Sign in one of your assigned signature fields',
        );
      }
      const field = doc.signatureFields?.id(dto.signatureFieldId);
      if (!field) throw new NotFoundException('Signature field not found');
      if (String(field.signerId) !== String(signer._id)) {
        throw new ForbiddenException('This field is not assigned to you');
      }
      if (String(field.stepId) !== String(step._id)) {
        throw new BadRequestException('Field belongs to a different step');
      }
      const existing = await this.signatureModel
        .exists({ documentId: doc._id, signatureFieldId: field._id })
        .exec();
      if (existing) {
        throw new BadRequestException('This field has already been signed');
      }
      pageNumber = field.pageNumber;
      x = field.x;
      y = field.y;
      width = field.width;
      height = field.height;
      signatureFieldId = field._id;
    } else if (dto.signatureFieldId) {
      throw new BadRequestException('No assigned fields for this signer');
    }

    let imageKey = dto.imageKey;
    // Registered user picking from library
    if (dto.savedSignatureId && ctx.signerId) {
      const libraryKey = await this.usersService.getSavedSignatureKey(
        ctx.signerId,
        dto.savedSignatureId,
      );
      if (!libraryKey) {
        throw new BadRequestException('Saved signature not found');
      }
      imageKey = libraryKey;
    }

    // Validate the imageKey belongs to a sensible namespace
    const validNamespace =
      imageKey.startsWith(`sigs/docs/${dto.documentId}/`) ||
      imageKey.startsWith('sigs/users/');
    if (!validNamespace) {
      throw new BadRequestException('Invalid imageKey');
    }

    const sig = await this.signatureModel.create({
      documentId: doc._id,
      stepId: step._id,
      signerId: ctx.signerId,
      signerEmail: ctx.signerEmail,
      savedSignatureId: dto.savedSignatureId
        ? new Types.ObjectId(dto.savedSignatureId)
        : null,
      signatureFieldId,
      pageNumber,
      x,
      y,
      width,
      height,
      imageKey,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      signedAt: new Date(),
    });

    const shouldCompleteSigner =
      assignedFields.length === 0 ||
      (await this.allAssignedFieldsSigned(
        doc._id,
        assignedFields.map((f) => f._id),
      ));

    if (shouldCompleteSigner) {
      await this.workflowService.recordSignature(
        String(doc._id),
        String(step._id),
        ctx.signerEmail,
        ctx.signerId,
        ctx.actorName,
      );
    }

    return {
      _id: String(sig._id),
      documentId: String(sig.documentId),
      stepId: String(sig.stepId),
      signerId: sig.signerId,
      signerEmail: sig.signerEmail,
      signatureFieldId: sig.signatureFieldId
        ? String(sig.signatureFieldId)
        : null,
      pageNumber: sig.pageNumber,
      x: sig.x,
      y: sig.y,
      width: sig.width,
      height: sig.height,
      imageUrl: await this.storageService.getDownloadUrl(sig.imageKey),
      signedAt: sig.signedAt.toISOString(),
    };
  }

  async rejectDocument(
    documentId: string,
    reason: string,
    ctx: SignerContext,
  ): Promise<void> {
    await this.workflowService.recordRejection(
      documentId,
      ctx.stepId,
      ctx.signerEmail,
      reason,
      ctx.signerId,
      ctx.actorName,
    );
  }

  async listSignaturesForDocument(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<SignatureDto[]> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();

    const sigs = await this.signatureModel.find({ documentId: doc._id }).exec();
    return Promise.all(
      sigs.map(async (s) => ({
        _id: String(s._id),
        documentId: String(s.documentId),
        stepId: String(s.stepId),
        signerId: s.signerId,
        signerEmail: s.signerEmail,
        signatureFieldId: s.signatureFieldId
          ? String(s.signatureFieldId)
          : null,
        pageNumber: s.pageNumber,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        imageUrl: await this.storageService.getDownloadUrl(s.imageKey),
        signedAt: s.signedAt.toISOString(),
      })),
    );
  }

  async getGuestSigningData(
    documentId: string,
    signerEmail: string,
    stepId: string,
  ): Promise<GuestSigningDataDto> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    const signer = step.signers.find((s) => s.email === signerEmail);
    if (!signer) throw new ForbiddenException();

    const presignedPdfUrl = doc.fileKey
      ? await this.storageService.getDownloadUrl(doc.fileKey)
      : undefined;
    const signatureFields = await this.signatureFieldsService.toFieldDtosForSigner(
      doc,
      String(step._id),
      String(signer._id),
    );
    return {
      documentTitle: doc.title,
      presignedPdfUrl,
      formTemplateId: doc.formTemplateId ?? null,
      formValues: doc.formValues ?? {},
      stepLabel: step.label,
      stepId: String(step._id),
      signerName: signer.name,
      signerEmail: signer.email,
      alreadySigned: signer.status !== 'pending',
      signatureFields,
    };
  }

  private async allAssignedFieldsSigned(
    documentId: Types.ObjectId,
    fieldIds: Types.ObjectId[],
  ): Promise<boolean> {
    const signedCount = await this.signatureModel
      .countDocuments({
        documentId,
        signatureFieldId: { $in: fieldIds },
      })
      .exec();
    return signedCount >= fieldIds.length;
  }
}
