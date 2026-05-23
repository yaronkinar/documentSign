import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SignatureFieldDto } from '@docflow/shared';

import { Document, DocumentDocument } from './document.schema';
import { Signature, SignatureDocument } from '../signatures/signature.schema';
import { CreateSignatureFieldDto } from './signature-fields.dto';

function fieldsOf(doc: DocumentDocument) {
  return doc.signatureFields ?? [];
}

@Injectable()
export class SignatureFieldsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    @InjectModel(Signature.name)
    private readonly signatureModel: Model<SignatureDocument>,
  ) {}

  async listFields(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<SignatureFieldDto[]> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();
    if (!doc.signatureFields) {
      doc.set('signatureFields', []);
    }
    return this.toFieldDtos(doc);
  }

  async createField(
    documentId: string,
    dto: CreateSignatureFieldDto,
    clerkId: string,
  ): Promise<SignatureFieldDto> {
    const doc = await this.findOwnedDraft(documentId, clerkId);
    const step = doc.workflowSteps.id(dto.stepId);
    if (!step) throw new NotFoundException('Step not found');
    const signer = step.signers.id(dto.signerId);
    if (!signer) throw new NotFoundException('Signer not found');

    if (!doc.signatureFields) {
      doc.set('signatureFields', []);
    }

    doc.signatureFields.push({
      stepId: step._id,
      signerId: signer._id,
      pageNumber: dto.pageNumber,
      x: dto.x,
      y: dto.y,
      width: dto.width ?? 15,
      height: dto.height ?? 6,
      label: dto.label ?? null,
    });
    await doc.save();

    const field = doc.signatureFields[doc.signatureFields.length - 1];
    const signedIds = await this.getSignedFieldIds(doc._id);
    return this.toFieldDto(doc, field, signedIds);
  }

  async deleteField(
    documentId: string,
    fieldId: string,
    clerkId: string,
  ): Promise<void> {
    const doc = await this.findOwnedDraft(documentId, clerkId);
    const field = doc.signatureFields.id(fieldId);
    if (!field) throw new NotFoundException('Field not found');

    const alreadySigned = await this.signatureModel
      .exists({ documentId: doc._id, signatureFieldId: field._id })
      .exec();
    if (alreadySigned) {
      throw new BadRequestException('Cannot remove a field that has been signed');
    }

    field.deleteOne();
    await doc.save();
  }

  async toFieldDtos(doc: DocumentDocument): Promise<SignatureFieldDto[]> {
    const signedIds = await this.getSignedFieldIds(doc._id);
    return fieldsOf(doc).map((field) =>
      this.toFieldDto(doc, field, signedIds),
    );
  }

  async toFieldDtosForSigner(
    doc: DocumentDocument,
    stepId: string,
    signerId: string,
  ): Promise<SignatureFieldDto[]> {
    const signedIds = await this.getSignedFieldIds(doc._id);
    return fieldsOf(doc)
      .filter(
        (field) =>
          String(field.stepId) === stepId &&
          String(field.signerId) === signerId,
      )
      .map((field) => this.toFieldDto(doc, field, signedIds));
  }

  private toFieldDto(
    doc: DocumentDocument,
    field: DocumentDocument['signatureFields'][number],
    signedIds: Set<string>,
  ): SignatureFieldDto {
    const step = doc.workflowSteps.id(field.stepId);
    const signer = step?.signers.id(field.signerId);
    return {
      _id: String(field._id),
      stepId: String(field.stepId),
      signerId: String(field.signerId),
      signerEmail: signer?.email ?? '',
      signerName: signer?.name ?? null,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      label: field.label,
      signed: signedIds.has(String(field._id)),
    };
  }

  private async getSignedFieldIds(
    documentId: DocumentDocument['_id'],
  ): Promise<Set<string>> {
    const sigs = await this.signatureModel
      .find({ documentId, signatureFieldId: { $ne: null } })
      .select('signatureFieldId')
      .exec();
    return new Set(
      sigs
        .map((s) => (s.signatureFieldId ? String(s.signatureFieldId) : null))
        .filter((id): id is string => id !== null),
    );
  }

  private async findOwnedDraft(
    documentId: string,
    clerkId: string,
  ): Promise<DocumentDocument> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== clerkId) throw new ForbiddenException();
    if (doc.status !== 'draft') {
      throw new BadRequestException(
        'Signature fields can only be edited while the document is a draft',
      );
    }
    if (!doc.signatureFields) {
      doc.set('signatureFields', []);
    }
    return doc;
  }
}
