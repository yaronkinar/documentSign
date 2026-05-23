import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'signatures', timestamps: false })
export class Signature {
  @Prop({ type: Types.ObjectId, ref: 'Document', required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  stepId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  signerId!: string | null;

  @Prop({ required: true, lowercase: true })
  signerEmail!: string;

  @Prop({ type: Types.ObjectId, default: null })
  savedSignatureId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  signatureFieldId!: Types.ObjectId | null;

  @Prop({ required: true })
  pageNumber!: number;

  @Prop({ required: true })
  x!: number;

  @Prop({ required: true })
  y!: number;

  @Prop({ required: true })
  width!: number;

  @Prop({ required: true })
  height!: number;

  /** Internal storage key - NEVER returned to clients. */
  @Prop({ required: true })
  imageKey!: string;

  @Prop({ type: String, default: null })
  ipAddress!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  @Prop({ default: () => new Date() })
  signedAt!: Date;
}

export type SignatureDocument = HydratedDocument<Signature>;
export const SignatureSchema = SchemaFactory.createForClass(Signature);
