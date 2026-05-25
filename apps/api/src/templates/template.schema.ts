import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: true, timestamps: false })
export class TemplateField {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  pageNumber!: number;

  @Prop({ required: true })
  x!: number;

  @Prop({ required: true })
  y!: number;

  @Prop({ required: true, default: 20 })
  width!: number;

  @Prop({ required: true, default: 6 })
  height!: number;
}

export const TemplateFieldSchema = SchemaFactory.createForClass(TemplateField);

@Schema({ collection: 'pdf_templates', timestamps: true })
export class PdfTemplate {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  ownerId!: string;

  /** Internal storage key — never returned to clients. */
  @Prop({ type: String, default: null })
  fileKey!: string | null;

  @Prop({ type: Number, default: null })
  fileSize!: number | null;

  @Prop({ type: Number, default: null })
  pageCount!: number | null;

  @Prop({ required: true, default: false })
  isDefault!: boolean;

  @Prop({ type: [TemplateFieldSchema], default: [] })
  fields!: Types.DocumentArray<TemplateField>;
}

export type PdfTemplateDocument = HydratedDocument<PdfTemplate>;
export const PdfTemplateSchema = SchemaFactory.createForClass(PdfTemplate);
