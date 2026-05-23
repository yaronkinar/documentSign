import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type {
  DocumentStatus,
  ExecutionMode,
  SignerStatus,
  WorkflowStepStatus,
  WorkflowStepType,
} from '@docflow/shared';

@Schema({ _id: true, timestamps: false })
export class Signer {
  _id!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, default: null })
  clerkId!: string | null;

  @Prop({ type: String, default: null })
  name!: string | null;

  @Prop({
    required: true,
    enum: ['pending', 'signed', 'rejected', 'skipped'],
    default: 'pending',
  })
  status!: SignerStatus;

  /** SECRET - never returned to clients. */
  @Prop({ type: String, default: null, select: true })
  inviteTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  inviteExpiry!: Date | null;

  @Prop({ type: Date, default: null })
  inviteSentAt!: Date | null;

  @Prop({ type: Date, default: null })
  signedAt!: Date | null;

  @Prop({ type: String, default: null })
  rejectionReason!: string | null;
}

export const SignerSchema = SchemaFactory.createForClass(Signer);

@Schema({ _id: true, timestamps: false })
export class WorkflowStep {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  stepNumber!: number;

  @Prop({
    required: true,
    enum: ['review', 'signature', 'approval', 'notification'],
    default: 'signature',
  })
  stepType!: WorkflowStepType;

  @Prop({ required: true })
  label!: string;

  @Prop({
    required: true,
    enum: ['sequential', 'parallel'],
    default: 'parallel',
  })
  executionMode!: ExecutionMode;

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({
    required: true,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending',
  })
  status!: WorkflowStepStatus;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: [SignerSchema], default: [] })
  signers!: Types.DocumentArray<Signer>;
}

export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

@Schema({ _id: true, timestamps: false })
export class SignatureField {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  stepId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  signerId!: Types.ObjectId;

  @Prop({ required: true })
  pageNumber!: number;

  @Prop({ required: true })
  x!: number;

  @Prop({ required: true })
  y!: number;

  @Prop({ required: true, default: 15 })
  width!: number;

  @Prop({ required: true, default: 6 })
  height!: number;

  @Prop({ type: String, default: null })
  label!: string | null;
}

export const SignatureFieldSchema = SchemaFactory.createForClass(SignatureField);

@Schema({ collection: 'documents', timestamps: true })
export class Document {
  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  /** Internal storage key - NEVER returned to clients. Null for template-only documents. */
  @Prop({ type: String, default: null })
  fileKey!: string | null;

  @Prop({ type: Number, default: null })
  fileSize!: number | null;

  @Prop({ type: Number, default: null })
  pageCount!: number | null;

  /** Optional storage key for the merged/completed PDF (Phase 3). */
  @Prop({ type: String, default: null })
  completedFileKey!: string | null;

  /** Clerk user id of the owner. */
  @Prop({ required: true, index: true })
  ownerId!: string;

  @Prop({
    required: true,
    enum: [
      'draft',
      'pending_review',
      'pending_signature',
      'approved',
      'rejected',
      'completed',
    ],
    default: 'draft',
    index: true,
  })
  status!: DocumentStatus;

  @Prop({ required: true, default: 0 })
  currentStep!: number;

  @Prop({ type: [WorkflowStepSchema], default: [] })
  workflowSteps!: Types.DocumentArray<WorkflowStep>;

  @Prop({ type: [SignatureFieldSchema], default: [] })
  signatureFields!: Types.DocumentArray<SignatureField>;

  @Prop({ type: [String], default: [], index: true })
  participantEmails!: string[];

  @Prop({ type: [String], default: [], index: true })
  participantClerkIds!: string[];

  /** Known PDF form template (e.g. haknasot municipal income form). */
  @Prop({ type: String, default: null })
  formTemplateId!: string | null;

  @Prop({ type: Object, default: {} })
  formValues!: Record<string, string>;
}

export type DocumentDocument = HydratedDocument<Document>;
export const DocumentSchema = SchemaFactory.createForClass(Document);

/** Older documents may lack signatureFields until saved again. */
DocumentSchema.post('init', function initSignatureFields(doc) {
  if (!doc.signatureFields) {
    doc.set('signatureFields', []);
  }
  if (!doc.formValues) {
    doc.set('formValues', {});
  }
});

DocumentSchema.index({ participantEmails: 1 });
DocumentSchema.index({ participantClerkIds: 1 });
