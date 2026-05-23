import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AuditEventType } from '@docflow/shared';

@Schema({ collection: 'audit_events', timestamps: { createdAt: true, updatedAt: false } })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, ref: 'Document', required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: String, default: null })
  actorId!: string | null;

  @Prop({ type: String, required: true, lowercase: true })
  actorEmail!: string;

  @Prop({ type: String, default: null })
  actorName!: string | null;

  @Prop({ type: String, required: true, enum: Object.values(AuditEventType) })
  eventType!: AuditEventType;

  @Prop({ type: Object, default: null })
  metadata!: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  ipAddress!: string | null;

  @Prop({ default: () => new Date() })
  createdAt!: Date;
}

export type AuditEventDocument = HydratedDocument<AuditEvent>;
export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
