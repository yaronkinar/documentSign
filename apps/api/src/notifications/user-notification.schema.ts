import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { UserNotificationType } from '@docflow/shared';

@Schema({ collection: 'user_notifications', timestamps: true })
export class UserNotification {
  @Prop({ type: String, default: null, index: true })
  recipientClerkId!: string | null;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  recipientEmail!: string;

  @Prop({ required: true, enum: ['comment', 'comment_reply'] })
  type!: UserNotificationType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ required: true })
  documentTitle!: string;

  @Prop({ type: Types.ObjectId, required: true })
  commentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  parentCommentId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  authorName!: string | null;

  @Prop({ required: true, lowercase: true, trim: true })
  authorEmail!: string;

  @Prop({ required: true })
  contentPreview!: string;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;
}

export type UserNotificationDocument = HydratedDocument<UserNotification>;
export const UserNotificationSchema =
  SchemaFactory.createForClass(UserNotification);

UserNotificationSchema.index({ recipientClerkId: 1, read: 1, createdAt: -1 });
UserNotificationSchema.index({ recipientEmail: 1, read: 1, createdAt: -1 });
