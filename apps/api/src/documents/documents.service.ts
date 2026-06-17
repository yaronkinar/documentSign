import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  allowedDocumentFormFieldIds,
  allocateFormFieldId,
  AuditEventType,
  buildPdfFormFieldsFromExtracted,
  getHaknasotFormFields,
  HAKNASOT_FORM_TEMPLATE_ID,
  isEditableDocumentFormField,
  isKnownFormTemplateId,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
  resolveDocumentFormFields,
  type DocumentDto,
  type PdfFormFieldTemplate,
} from '@docflow/shared';

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
import { fieldLabelAppearsInPdfText } from '../ai/pdf-field-label';
import { AiService } from '../ai/ai.service';
import {
  AttachFormTemplateDto,
  ConfirmUploadDto,
  CreateDocumentDto,
  CreateDocumentFormFieldDto,
  UpdateDocumentDto,
  UpdateDocumentFormFieldDto,
  UpdateFormValuesDto,
} from './documents.dto';
import { toDocumentDto } from './documents.mapper';
import { TemplatesService } from '../templates/templates.service';
import { WorkflowService } from '../workflow/workflow.service';
import { renderHaknasotPdf, type SignedRowInput } from './haknasot-renderer';
import {
  renderFilledUploadedPdf,
  type SignatureStampInput,
} from './signed-pdf-renderer';
import {
  SignerProfile,
  type SignerProfileDocument,
} from '../signer-profiles/signer-profile.schema';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    @InjectModel(Signature.name)
    private readonly signatureModel: Model<SignatureDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(SignerProfile.name)
    private readonly signerProfileModel: Model<SignerProfileDocument>,
    private readonly invitesService: InvitesService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
    private readonly workflowService: WorkflowService,
    private readonly templatesService: TemplatesService,
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

  async createFromPdfTemplate(
    clerkId: string,
    actorEmail: string,
    dto: CreateDocumentDto,
  ): Promise<DocumentDto> {
    const pdfTemplateId = dto.pdfTemplateId!.trim();
    const { buffer, fileSize, pageCount, name } =
      await this.templatesService.readTemplatePdf(pdfTemplateId, clerkId);

    const documentId = new Types.ObjectId();
    const fileKey = `docs/${documentId.toString()}/${uuidv4()}.pdf`;
    await this.storageService.uploadBuffer(fileKey, buffer, 'application/pdf');

    const doc = new this.documentModel({
      _id: documentId,
      title: (dto.title?.trim() || name).slice(0, 200),
      description: dto.description ?? null,
      fileKey,
      fileSize,
      pageCount: pageCount ?? 1,
      pdfTemplateId,
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
      metadata: { title: doc.title, pdfTemplateId },
    });

    const fileUrl = await this.storageService.getDownloadUrl(fileKey);
    return toDocumentDto(doc, { fileUrl });
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
    if (!doc.fileKey) {
      throw new BadRequestException('Document has no storage key');
    }
    if (!(await this.storageService.objectExists(doc.fileKey))) {
      throw new BadRequestException(
        'PDF upload was not found in storage. Please upload the file again.',
      );
    }
    doc.fileSize = dto.fileSize;
    doc.pageCount = dto.pageCount;
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.DocumentUploaded,
      metadata: { fileSize: dto.fileSize, pageCount: dto.pageCount },
    });

    const fileUrl = await this.storageService.getDownloadUrl(doc.fileKey);
    return toDocumentDto(doc, { fileUrl });
  }

  async summarizeDocument(
    documentId: string,
    clerkId: string,
  ): Promise<{ summary: string }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.description?.trim()) {
      return { summary: doc.description };
    }

    let text = '';
    if (doc.fileKey) {
      const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
      text = await this.aiService.extractPdfText(pdfBuffer);
    }

    const hasFormValues =
      doc.formValues &&
      Object.values(doc.formValues).some(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
    if (!text && !hasFormValues) {
      throw new BadRequestException('Document has no content to summarize');
    }

    const signers = doc.workflowSteps.flatMap((step) =>
      step.signers.map((s) => ({
        name: s.name,
        email: s.email,
        status: s.status,
        stepLabel: step.label,
      })),
    );
    const summary = await this.aiService.summarizeDocumentText(text, {
      title: doc.title,
      formValues: doc.formValues,
      signers,
    });
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

  async extractFormFields(
    documentId: string,
    clerkId: string,
  ): Promise<{ fields: PdfFormFieldTemplate[] }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (!doc.fileKey) {
      throw new BadRequestException('Document has no uploaded PDF');
    }
    if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
      throw new BadRequestException('Form extraction is for uploaded PDFs only');
    }

    const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
    const pdfText = await this.aiService.extractPdfText(pdfBuffer);
    const rolesFromPdf = await this.aiService.extractSignerRoles(pdfText);
    const signerHints = rolesFromPdf.map((label) => ({ label }));
    const extracted = await this.aiService.extractTemplateFieldsFromPdf(
      pdfBuffer,
      doc.pageCount,
      signerHints,
      'uploaded_document',
    );
    const filtered = extracted.filter((field) =>
      fieldLabelAppearsInPdfText(field.label, pdfText),
    );
    const extractedFields = buildPdfFormFieldsFromExtracted(filtered);
    const existing = (doc.formFields ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    }));
    const existingIds = new Set(existing.map((f) => f.id));
    const existingPlacementKeys = new Set(
      existing.map((f) => `${f.pageNumber}:${f.label.trim().toLowerCase()}`),
    );
    const merged = [
      ...existing,
      ...extractedFields.filter((f) => {
        if (existingIds.has(f.id)) return false;
        const key = `${f.pageNumber}:${f.label.trim().toLowerCase()}`;
        if (existingPlacementKeys.has(key)) return false;
        existingPlacementKeys.add(key);
        return true;
      }),
    ];
    doc.formFields = merged as never;
    doc.markModified('formFields');
    await doc.save();
    return { fields: merged };
  }

  /** Editing existing/built-in fields (move, resize, relabel, reset) only needs a draft. */
  private assertDraftForFormFields(doc: DocumentDocument): void {
    if (doc.status !== 'draft') {
      throw new ForbiddenException('Form fields can only be edited in draft');
    }
  }

  /** Adding a brand-new custom field still requires an uploaded PDF. */
  private assertCanAddFormFields(doc: DocumentDocument): void {
    this.assertDraftForFormFields(doc);
    if (!doc.fileKey && !(doc.formFields?.length)) {
      throw new BadRequestException(
        'Form fields require an uploaded PDF or existing custom fields',
      );
    }
    if (
      doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID &&
      !doc.fileKey
    ) {
      throw new BadRequestException(
        'Add custom fields on haknasot documents with an uploaded PDF only',
      );
    }
  }

  /** A built-in Haknasot base field id (not a user-added custom field). */
  private isHaknasotBaseField(doc: DocumentDocument, fieldId: string): boolean {
    return (
      doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID &&
      getHaknasotFormFields().some((f) => f.id === fieldId)
    );
  }

  private docFormFieldSnapshot(
    doc: DocumentDocument,
  ): PdfFormFieldTemplate[] {
    return (doc.formFields ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    }));
  }

  async addFormField(
    documentId: string,
    clerkId: string,
    dto: CreateDocumentFormFieldDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    this.assertCanAddFormFields(doc);

    const existingIds = this.docFormFieldSnapshot(doc).map((f) => f.id);
    const id = allocateFormFieldId(dto.label, existingIds);
    const field = {
      id,
      label: dto.label.trim(),
      type: dto.type ?? 'text',
      section: dto.section?.trim() || `page_${dto.pageNumber}`,
      pageNumber: dto.pageNumber,
      x: dto.x,
      y: dto.y,
      width: dto.width ?? 20,
      height: dto.height ?? 6,
    };

    if (!doc.formFields) doc.formFields = [] as never;
    doc.formFields.push(field as never);
    doc.markModified('formFields');
    await doc.save();
    return toDocumentDto(doc);
  }

  async updateFormField(
    documentId: string,
    clerkId: string,
    fieldId: string,
    dto: UpdateDocumentFormFieldDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    this.assertDraftForFormFields(doc);

    const snapshot = this.docFormFieldSnapshot(doc);
    if (
      !isEditableDocumentFormField(
        { formTemplateId: doc.formTemplateId, formFields: snapshot },
        fieldId,
      )
    ) {
      throw new NotFoundException('Form field not found or not editable');
    }

    if (!doc.formFields) doc.formFields = [] as never;
    let field = doc.formFields.find((f) => f.id === fieldId);
    if (!field) {
      // Built-in Haknasot base field edited for the first time: materialize an
      // override copy from the resolved base definition, then patch it.
      const base = resolveDocumentFormFields({
        formTemplateId: doc.formTemplateId,
        formFields: snapshot,
      }).find((f) => f.id === fieldId);
      if (!base) throw new NotFoundException('Form field not found');
      doc.formFields.push({ ...base } as never);
      field = doc.formFields.find((f) => f.id === fieldId);
    }
    if (!field) throw new NotFoundException('Form field not found');

    if (dto.label !== undefined) field.label = dto.label.trim();
    if (dto.type !== undefined) field.type = dto.type;
    if (dto.section !== undefined) field.section = dto.section.trim();
    if (dto.pageNumber !== undefined) field.pageNumber = dto.pageNumber;
    if (dto.x !== undefined) field.x = dto.x;
    if (dto.y !== undefined) field.y = dto.y;
    if (dto.width !== undefined) field.width = dto.width;
    if (dto.height !== undefined) field.height = dto.height;

    doc.markModified('formFields');
    await doc.save();
    return toDocumentDto(doc);
  }

  async deleteFormField(
    documentId: string,
    clerkId: string,
    fieldId: string,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    this.assertDraftForFormFields(doc);

    const snapshot = this.docFormFieldSnapshot(doc);
    if (
      !isEditableDocumentFormField(
        { formTemplateId: doc.formTemplateId, formFields: snapshot },
        fieldId,
      )
    ) {
      throw new NotFoundException('Form field not found or not editable');
    }

    // For a built-in Haknasot base field this removes the override entry,
    // resetting it to the default position while keeping its filled value.
    // For a genuine custom field this deletes the field and its value.
    const resetOnly = this.isHaknasotBaseField(doc, fieldId);
    doc.formFields = (doc.formFields ?? []).filter(
      (f) => f.id !== fieldId,
    ) as never;
    if (!resetOnly && doc.formValues?.[fieldId]) {
      const next = { ...doc.formValues };
      delete next[fieldId];
      doc.formValues = next;
      doc.markModified('formValues');
    }
    doc.markModified('formFields');
    await doc.save();
    return toDocumentDto(doc);
  }

  async updateDocument(
    documentId: string,
    clerkId: string,
    dto: UpdateDocumentDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (dto.title !== undefined) {
      doc.title = dto.title;
    }
    if (dto.description !== undefined) doc.description = dto.description;
    await doc.save();
    return toDocumentDto(doc);
  }

  async attachFormTemplate(
    documentId: string,
    clerkId: string,
    dto: AttachFormTemplateDto,
  ): Promise<DocumentDto> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.status !== 'draft') {
      throw new ForbiddenException('Form template can only be set in draft');
    }
    const templateId = dto.formTemplateId.trim();
    if (!isKnownFormTemplateId(templateId)) {
      throw new BadRequestException(`Unknown form template: ${templateId}`);
    }

    if (templateId === HAKNASOT_FORM_TEMPLATE_ID) {
      const fields = getHaknasotFormFields();
      if (!doc.fileKey) {
        doc.formTemplateId = HAKNASOT_FORM_TEMPLATE_ID;
        doc.formFields = [] as never;
      } else {
        doc.formFields = fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          section: f.section,
          pageNumber: f.pageNumber,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        })) as never;
        doc.markModified('formFields');
      }
      await doc.save();
      return toDocumentDto(doc);
    }

    throw new BadRequestException(`Unsupported form template: ${templateId}`);
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
    const allowedIds = allowedDocumentFormFieldIds({
      formTemplateId: doc.formTemplateId,
      formFields: doc.formFields?.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    });
    if (allowedIds.size === 0) {
      throw new ForbiddenException('Document has no fillable form fields');
    }

    const allowed = new Set(
      Object.keys(dto.values).filter(
        (key) => typeof dto.values[key] === 'string' && allowedIds.has(key),
      ),
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
    if (doc.fileKey && (await this.storageService.objectExists(doc.fileKey))) {
      try {
        fileUrl = await this.storageService.getDownloadUrl(doc.fileKey);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[documents] failed to sign PDF download URL', err);
      }
    } else if (doc.fileKey) {
      // eslint-disable-next-line no-console
      console.warn(
        `[documents] PDF missing in storage for document ${documentId} (${doc.fileKey})`,
      );
    }

    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail: email,
      eventType: AuditEventType.DocumentViewed,
    });
    return toDocumentDto(doc, fileUrl ? { fileUrl } : undefined);
  }

  private toFormFieldTemplates(
    doc: DocumentDocument,
  ): PdfFormFieldTemplate[] {
    return resolveDocumentFormFields({
      formTemplateId: doc.formTemplateId,
      formFields: doc.formFields?.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    });
  }

  private async collectSignatureStamps(
    doc: DocumentDocument,
  ): Promise<SignatureStampInput[]> {
    const signatureDocs = await this.signatureModel
      .find({ documentId: doc._id })
      .exec();
    const stamps: SignatureStampInput[] = [];
    for (const sig of signatureDocs) {
      try {
        const imageBytes = await this.storageService.downloadObject(sig.imageKey);
        stamps.push({
          pageNumber: sig.pageNumber,
          x: sig.x,
          y: sig.y,
          width: sig.width,
          height: sig.height,
          imageBytes,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          '[documents] failed to load signature image for download',
          sig.imageKey,
          err,
        );
      }
    }
    return stamps;
  }

  /** Raw uploaded PDF bytes for in-browser preview (overlays drawn client-side). */
  async getDocumentSourcePdf(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<Buffer> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();
    if (!doc.fileKey) {
      throw new BadRequestException('Document has no uploaded PDF');
    }
    if (!(await this.storageService.objectExists(doc.fileKey))) {
      throw new NotFoundException('Uploaded PDF file is missing from storage');
    }
    return this.storageService.downloadObject(doc.fileKey);
  }

  async renderDocumentPdf(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<Buffer> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();

    if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID && !doc.fileKey) {
      return this.renderHaknasotDocument(documentId, clerkId, email);
    }

    if (doc.fileKey) {
      return this.renderUploadedPdfComplete(doc);
    }

    throw new BadRequestException('Document has no renderable PDF');
  }

  async renderHaknasotDocument(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<Buffer> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();
    if (doc.formTemplateId !== HAKNASOT_FORM_TEMPLATE_ID) {
      throw new BadRequestException('Document does not use the haknasot template');
    }

    const signatureDocs = await this.signatureModel
      .find({ documentId: doc._id })
      .exec();
    const signerProfiles = await this.signerProfileModel
      .find({ ownerId: doc.ownerId, templateId: doc.formTemplateId })
      .select('title name email')
      .lean()
      .exec();
    const profileNameByTitle = new Map<string, string>();
    const profilesByEmail = new Map<string, typeof signerProfiles>();
    const usableProfileName = (name?: string | null): string | null => {
      const trimmed = name?.trim();
      return trimmed && trimmed !== '—' ? trimmed : null;
    };
    for (const profile of signerProfiles) {
      const profileName = usableProfileName(profile.name);
      if (profileName) {
        profileNameByTitle.set(profile.title.trim(), profileName);
      }
      if (profile.email) {
        const email = profile.email.toLowerCase();
        profilesByEmail.set(email, [...(profilesByEmail.get(email) ?? []), profile]);
      }
    }
    const resolveSignerDisplayName = (signer: {
      email: string;
      name: string | null;
    }): string | null => {
      if (signer.name) {
        const profileName = profileNameByTitle.get(signer.name.trim());
        if (profileName) return profileName;
      }
      const emailProfiles = profilesByEmail.get(signer.email.toLowerCase()) ?? [];
      if (signer.name) {
        const profileByTitle = emailProfiles.find(
          (profile) => profile.title.trim() === signer.name?.trim(),
        );
        const profileName = usableProfileName(profileByTitle?.name);
        if (profileName) return profileName;
      }
      if (emailProfiles.length === 1) {
        const profileName = usableProfileName(emailProfiles[0]?.name);
        if (profileName) return profileName;
      }
      return signer.name;
    };

    // Map signers to their row index by walking workflowSteps in order.
    // Prefer signatureFieldId because the same person can approve multiple rows.
    // Global clerk/email fallbacks are only used when they are unique.
    const rowByFieldId = new Map<string, number>();
    const rowByStepAndClerkId = new Map<string, number>();
    const rowByStepAndEmail = new Map<string, number>();
    const rowByClerkId = new Map<string, number | null>();
    const rowByEmail = new Map<string, number | null>();
    interface SignerRow { clerkId: string | null; email: string; name: string | null; rowIndex: number }
    const allSigners: SignerRow[] = [];
    let rowCursor = 0;
    const setUnique = (map: Map<string, number | null>, key: string, value: number) => {
      map.set(key, map.has(key) ? null : value);
    };
    for (const step of doc.workflowSteps) {
      if (step.stepType !== 'signature' && step.stepType !== 'approval') continue;
      for (const signer of step.signers) {
        const stepId = String(step._id);
        const email = signer.email.toLowerCase();
        if (signer.clerkId) {
          rowByStepAndClerkId.set(`${stepId}:${signer.clerkId}`, rowCursor);
          setUnique(rowByClerkId, signer.clerkId, rowCursor);
        }
        rowByStepAndEmail.set(`${stepId}:${email}`, rowCursor);
        setUnique(rowByEmail, email, rowCursor);

        const field = doc.signatureFields?.find(
          (f) =>
            String(f.stepId) === stepId &&
            String(f.signerId) === String(signer._id),
        );
        if (field) rowByFieldId.set(String(field._id), rowCursor);

        allSigners.push({
          clerkId: signer.clerkId,
          email: signer.email,
          name: resolveSignerDisplayName(signer),
          rowIndex: rowCursor,
        });
        rowCursor += 1;
      }
    }

    const signedRows: SignedRowInput[] = [];
    for (const sig of signatureDocs) {
      const stepId = String(sig.stepId);
      const email = sig.signerEmail.toLowerCase();
      const rowIndex =
        (sig.signatureFieldId
          ? rowByFieldId.get(String(sig.signatureFieldId))
          : undefined) ??
        (sig.signerId
          ? rowByStepAndClerkId.get(`${stepId}:${sig.signerId}`)
          : undefined) ??
        rowByStepAndEmail.get(`${stepId}:${email}`) ??
        (sig.signerId ? rowByClerkId.get(sig.signerId) : undefined) ??
        rowByEmail.get(email);
      if (rowIndex == null) continue;

      let imageBytes: Buffer | null = null;
      try {
        imageBytes = await this.storageService.downloadObject(sig.imageKey);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[documents] failed to load signature image', sig.imageKey, err);
      }

      const signer = allSigners.find((s) => s.rowIndex === rowIndex);

      signedRows.push({
        rowIndex,
        name: signer?.name ?? null,
        email: sig.signerEmail,
        signedAt: sig.signedAt ?? null,
        imageBytes,
      });
    }

    return renderHaknasotPdf({
      formValues: doc.formValues ?? {},
      signedRows,
      contractTypeSelection: (doc.formValues ?? {})['contract_type'] ?? null,
      fields: resolveDocumentFormFields({
        formTemplateId: doc.formTemplateId,
        formFields: this.docFormFieldSnapshot(doc),
      }),
    });
  }

  async downloadDocumentPdf(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<Buffer> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();

    if (doc.completedFileKey) {
      return this.storageService.downloadObject(doc.completedFileKey);
    }

    if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
      return this.renderHaknasotDocument(documentId, clerkId, email);
    }

    if (doc.fileKey) {
      return this.renderUploadedPdfComplete(doc);
    }

    throw new BadRequestException('Document has no downloadable PDF');
  }

  /** Bake form values and signature overlays into an uploaded PDF. */
  private async renderUploadedPdfComplete(
    doc: DocumentDocument,
  ): Promise<Buffer> {
    const pdfBytes = await this.storageService.downloadObject(doc.fileKey!);
    const fields = this.toFormFieldTemplates(doc);
    const stamps = await this.collectSignatureStamps(doc);
    if (fields.length === 0 && stamps.length === 0) return pdfBytes;
    return renderFilledUploadedPdf(
      pdfBytes,
      fields,
      doc.formValues ?? {},
      stamps,
    );
  }

  /**
   * Dev-only: programmatically signs every pending signer in the active step
   * by uploading a stub PNG and recording a real Signature + workflow event.
   * Only available when BYPASS_AUTH=true.
   */
  async devSignAll(
    documentId: string,
    clerkId: string,
    imageKeys?: Record<string, string>,
  ): Promise<DocumentDto> {
    if (process.env.BYPASS_AUTH !== 'true') {
      throw new ForbiddenException('devSignAll only available in bypass-auth mode');
    }
    const doc = await this.findOwnedDocument(documentId, clerkId);

    // Minimal 1×1 transparent PNG — renderer falls back to drawing name+date text.
    const STUB_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    for (const step of doc.workflowSteps) {
      if (step.status !== 'in_progress') continue;
      for (const signer of step.signers) {
        if (signer.status !== 'pending') continue;

        let imageKey: string;
        if (imageKeys?.[signer.email]) {
          // Use the pre-uploaded real signature image
          imageKey = imageKeys[signer.email];
        } else {
          const sigId = new Types.ObjectId();
          imageKey = `sigs/docs/${documentId}/${sigId.toString()}.png`;
          await this.storageService.uploadBuffer(imageKey, STUB_PNG, 'image/png');
        }

        const assignedField = (doc.signatureFields ?? []).find(
          (f) =>
            String(f.signerId) === String(signer._id) &&
            String(f.stepId) === String(step._id),
        );

        await this.signatureModel.create({
          documentId: doc._id,
          stepId: step._id,
          signerId: null,
          signerEmail: signer.email,
          signatureFieldId: assignedField?._id ?? null,
          pageNumber: assignedField?.pageNumber ?? 2,
          x: assignedField?.x ?? 38,
          y: assignedField?.y ?? 30,
          width: assignedField?.width ?? 20,
          height: assignedField?.height ?? 3.5,
          imageKey,
          ipAddress: null,
          userAgent: null,
          signedAt: new Date(),
        });

        await this.workflowService.recordSignature(
          documentId,
          String(step._id),
          signer.email,
          null,
          signer.name,
          String(signer._id),
        );
      }
    }

    const fresh = await this.documentModel.findById(documentId).exec();
    if (!fresh) throw new NotFoundException('Document not found');
    return toDocumentDto(fresh);
  }

  async deleteDocument(
    documentId: string,
    clerkId: string,
    actorEmail: string,
  ): Promise<void> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(actorEmail.toLowerCase());
    if (!isParticipant) throw new ForbiddenException('Not a participant');
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
