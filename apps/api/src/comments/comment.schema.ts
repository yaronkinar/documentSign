import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { CommentType } from '@docflow/shared';

@Schema({ collection: 'comments', timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Document', required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  authorId!: string | null;

  @Prop({ required: true, lowercase: true })
  authorEmail!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: Number, default: null })
  pageNumber!: number | null;

  @Prop({ type: Number, default: null })
  x!: number | null;

  @Prop({ type: Number, default: null })
  y!: number | null;

  @Prop({
    required: true,
    enum: ['general', 'annotation', 'rejection_reason', 'approval_note'],
    default: 'general',
  })
  type!: CommentType;

  @Prop({ default: false })
  resolved!: boolean;

  @Prop({ type: String, default: null })
  resolvedBy!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  parentId!: Types.ObjectId | null;
}

export type CommentDocument = HydratedDocument<Comment>;
export const CommentSchema = SchemaFactory.createForClass(Comment);
