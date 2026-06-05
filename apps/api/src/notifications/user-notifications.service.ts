import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UserNotificationDto, UserNotificationType } from '@docflow/shared';

import {
  UserNotification,
  UserNotificationDocument,
} from './user-notification.schema';

export interface CommentNotificationRecipient {
  email: string;
  name: string | null;
  clerkId: string | null;
  type: UserNotificationType;
}

@Injectable()
export class UserNotificationsService {
  constructor(
    @InjectModel(UserNotification.name)
    private readonly notificationModel: Model<UserNotificationDocument>,
  ) {}

  async createCommentNotifications(
    recipients: CommentNotificationRecipient[],
    data: {
      documentId: string;
      documentTitle: string;
      commentId: string;
      parentCommentId: string | null;
      authorName: string | null;
      authorEmail: string;
      contentPreview: string;
    },
  ): Promise<Array<{ dto: UserNotificationDto; clerkId: string | null }>> {
    if (recipients.length === 0) return [];

    const created = await this.notificationModel.insertMany(
      recipients.map((r) => ({
        recipientClerkId: r.clerkId,
        recipientEmail: r.email,
        type: r.type,
        documentId: new Types.ObjectId(data.documentId),
        documentTitle: data.documentTitle,
        commentId: new Types.ObjectId(data.commentId),
        parentCommentId: data.parentCommentId
          ? new Types.ObjectId(data.parentCommentId)
          : null,
        authorName: data.authorName,
        authorEmail: data.authorEmail.toLowerCase(),
        contentPreview: data.contentPreview,
        read: false,
        readAt: null,
      })),
    );

    return created.map((notification, index) => ({
      dto: this.toDto(notification),
      clerkId: recipients[index]?.clerkId ?? notification.recipientClerkId,
    }));
  }

  async listForUser(
    clerkId: string,
    email: string,
    limit = 30,
  ): Promise<UserNotificationDto[]> {
    const list = await this.notificationModel
      .find(this.userFilter(clerkId, email))
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return list.map((n) => this.toDto(n));
  }

  async getUnreadCount(clerkId: string, email: string): Promise<number> {
    return this.notificationModel
      .countDocuments({ ...this.userFilter(clerkId, email), read: false })
      .exec();
  }

  async markRead(
    id: string,
    clerkId: string,
    email: string,
  ): Promise<UserNotificationDto> {
    const notification = await this.notificationModel.findById(id).exec();
    if (!notification) throw new NotFoundException('Notification not found');
    if (!this.canAccess(notification, clerkId, email)) {
      throw new ForbiddenException();
    }
    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();
    }
    return this.toDto(notification);
  }

  async markAllRead(clerkId: string, email: string): Promise<number> {
    const result = await this.notificationModel
      .updateMany(
        { ...this.userFilter(clerkId, email), read: false },
        { $set: { read: true, readAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }

  private userFilter(clerkId: string, email: string) {
    const normalizedEmail = email.toLowerCase();
    return {
      $or: [
        { recipientClerkId: clerkId },
        { recipientEmail: normalizedEmail },
      ],
    };
  }

  private canAccess(
    notification: UserNotificationDocument,
    clerkId: string,
    email: string,
  ): boolean {
    const normalizedEmail = email.toLowerCase();
    return (
      notification.recipientClerkId === clerkId ||
      notification.recipientEmail === normalizedEmail
    );
  }

  private toDto(n: UserNotificationDocument): UserNotificationDto {
    const t = n as unknown as { createdAt: Date };
    return {
      _id: String(n._id),
      type: n.type,
      documentId: String(n.documentId),
      documentTitle: n.documentTitle,
      commentId: String(n.commentId),
      parentCommentId: n.parentCommentId ? String(n.parentCommentId) : null,
      authorName: n.authorName,
      authorEmail: n.authorEmail,
      contentPreview: n.contentPreview,
      read: n.read,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
