import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuditEventType,
  resolveMentionedEmails,
  type CommentDto,
  type SignerMentionRef,
} from '@docflow/shared';

import { Comment, CommentDocument } from './comment.schema';
import { Document, DocumentDocument } from '../documents/document.schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserNotificationsService,
  type CommentNotificationRecipient,
} from '../notifications/user-notifications.service';
import { UsersService } from '../users/users.service';
import { WorkflowGateway } from '../workflow/workflow.gateway';
import { CreateCommentDto, DevTestCommentNotifyDto } from './comments.dto';

export interface DevTestCommentNotifyResult {
  dryRun: boolean;
  authorEmail: string;
  authorClerkId: string;
  mentionedEmails: string[];
  recipients: string[];
  emailsQueued: number;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    private readonly auditService: AuditService,
    private readonly gateway: WorkflowGateway,
    private readonly notifications: NotificationsService,
    private readonly userNotifications: UserNotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async addComment(
    documentId: string,
    dto: CreateCommentDto,
    actorId: string,
    actorEmail: string,
    actorName: string | null,
  ): Promise<CommentDto> {
    const doc = await this.assertParticipant(documentId, actorId, actorEmail);
    const mentionedEmails = this.resolveMentionedEmails(
      doc,
      dto.content,
      dto.mentionedEmails,
    );
    const created = await this.commentModel.create({
      documentId: doc._id,
      authorId: actorId,
      authorEmail: actorEmail.toLowerCase(),
      authorName: actorName?.trim() || null,
      content: dto.content,
      mentionedEmails,
      pageNumber: dto.pageNumber ?? null,
      x: dto.x ?? null,
      y: dto.y ?? null,
      type: dto.type,
      resolved: false,
      resolvedBy: null,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
    });

    this.gateway.emit('comment:added', {
      documentId: String(doc._id),
      commentId: String(created._id),
      authorEmail: actorEmail,
      content: dto.content,
      parentId: dto.parentId ?? null,
    });
    this.auditService.log({
      documentId: doc._id,
      actorId,
      actorEmail,
      actorName,
      eventType: AuditEventType.Commented,
      metadata: { commentId: String(created._id), type: dto.type },
    });

    void this.notifyOtherParticipants(
      doc,
      actorId,
      actorEmail,
      actorName,
      dto.content,
      dto.type,
      String(created._id),
      dto.parentId ?? null,
      mentionedEmails,
    );

    return this.toDto(created);
  }

  async listComments(
    documentId: string,
    actorId: string,
    actorEmail: string,
  ): Promise<CommentDto[]> {
    await this.assertParticipant(documentId, actorId, actorEmail);
    const list = await this.commentModel
      .find({ documentId: new Types.ObjectId(documentId) })
      .sort({ createdAt: 1 })
      .exec();
    return list.map((c) => this.toDto(c));
  }

  /**
   * Dev-only: preview or send comment notification emails without persisting a comment.
   * Requires BYPASS_AUTH=true.
   */
  async devTestCommentNotifications(
    documentId: string,
    actorClerkId: string,
    actorEmail: string,
    dto: DevTestCommentNotifyDto,
  ): Promise<DevTestCommentNotifyResult> {
    if (process.env.BYPASS_AUTH !== 'true') {
      throw new ForbiddenException(
        'devTestCommentNotifications only available when BYPASS_AUTH=true',
      );
    }

    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== actorClerkId) {
      throw new ForbiddenException('Only the document owner can run this dev test');
    }

    const content = dto.content?.trim() || 'Dev test comment notification';
    const type = dto.type ?? 'general';
    const authorEmail = (dto.authorEmail ?? actorEmail).toLowerCase();
    const authorClerkId = dto.authorClerkId ?? actorClerkId;
    const authorName = dto.authorName?.trim() || null;
    const mentionedEmails = this.resolveMentionedEmails(
      doc,
      content,
      dto.mentionedEmails,
    );
    const recipients = await this.resolveCommentNotificationRecipients({
      doc,
      authorClerkId,
      authorEmail,
      commentType: type,
      mentionedEmails,
      parentId: null,
      ownerEmailOverride: dto.ownerEmailOverride?.toLowerCase(),
    });
    const dryRun = dto.dryRun === true;

    if (dryRun) {
      return {
        dryRun: true,
        authorEmail,
        authorClerkId,
        mentionedEmails,
        recipients,
        emailsQueued: 0,
      };
    }

    const commentPreview =
      content.length > 240 ? `${content.slice(0, 237)}...` : content;
    const namesByEmail = this.signerNamesByEmail(doc);

    await Promise.all(
      recipients.map((email) =>
        this.notifications.enqueueCommentEmail({
          to: email,
          recipientName: namesByEmail.get(email) ?? email,
          documentTitle: doc.title,
          documentId: String(doc._id),
          authorName,
          authorEmail,
          commentPreview,
        }),
      ),
    );

    return {
      dryRun: false,
      authorEmail,
      authorClerkId,
      mentionedEmails,
      recipients,
      emailsQueued: recipients.length,
    };
  }

  async resolveComment(
    commentId: string,
    actorId: string,
    actorEmail: string,
  ): Promise<CommentDto> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw new NotFoundException('Comment not found');
    await this.assertParticipant(
      String(comment.documentId),
      actorId,
      actorEmail,
    );
    comment.resolved = true;
    comment.resolvedBy = actorId;
    await comment.save();

    this.gateway.emit('comment:resolved', {
      documentId: String(comment.documentId),
      commentId: String(comment._id),
      resolvedBy: actorId,
    });
    this.auditService.log({
      documentId: comment.documentId,
      actorId,
      actorEmail,
      eventType: AuditEventType.CommentResolved,
      metadata: { commentId: String(comment._id) },
    });
    return this.toDto(comment);
  }

  private resolveMentionedEmails(
    doc: DocumentDocument,
    content: string,
    explicit?: string[],
  ): string[] {
    const signers: SignerMentionRef[] = doc.workflowSteps.flatMap((step) =>
      step.signers.map((signer) => ({
        email: signer.email,
        name: signer.name,
      })),
    );
    const fromContent = resolveMentionedEmails(content, signers);
    const combined = [
      ...(explicit ?? []).map((email) => email.toLowerCase()),
      ...fromContent,
    ];
    const participantSet = new Set(
      doc.participantEmails.map((email) => email.toLowerCase()),
    );
    return [...new Set(combined)].filter((email) => participantSet.has(email));
  }

  private signerNamesByEmail(doc: DocumentDocument): Map<string, string | null> {
    const namesByEmail = new Map<string, string | null>();
    for (const step of doc.workflowSteps) {
      for (const signer of step.signers) {
        namesByEmail.set(signer.email.toLowerCase(), signer.name);
      }
    }
    return namesByEmail;
  }

  private signerClerkIdsByEmail(doc: DocumentDocument): Map<string, string | null> {
    const clerkIdsByEmail = new Map<string, string | null>();
    for (const step of doc.workflowSteps) {
      for (const signer of step.signers) {
        clerkIdsByEmail.set(signer.email.toLowerCase(), signer.clerkId);
      }
    }
    return clerkIdsByEmail;
  }

  private async resolveCommentNotificationRecipients(options: {
    doc: DocumentDocument;
    authorClerkId: string;
    authorEmail: string;
    commentType: CreateCommentDto['type'];
    mentionedEmails: string[];
    parentId: string | null;
    ownerEmailOverride?: string;
  }): Promise<string[]> {
    const author = options.authorEmail.toLowerCase();
    const signerEmails = new Set<string>();
    for (const step of options.doc.workflowSteps) {
      for (const signer of step.signers) {
        signerEmails.add(signer.email.toLowerCase());
      }
    }

    let parentAuthorEmail: string | null = null;
    if (options.parentId) {
      const parent = await this.commentModel.findById(options.parentId).exec();
      parentAuthorEmail = parent?.authorEmail.toLowerCase() ?? null;
    }

    const mentionedSet = new Set(
      options.mentionedEmails.map((email) => email.toLowerCase()),
    );
    let recipients: string[];
    if (mentionedSet.size > 0) {
      recipients = [...mentionedSet].filter(
        (email) => email !== author && signerEmails.has(email),
      );
      if (
        parentAuthorEmail &&
        parentAuthorEmail !== author &&
        !recipients.includes(parentAuthorEmail)
      ) {
        recipients.push(parentAuthorEmail);
      }
    } else if (options.commentType === 'general') {
      recipients = [...signerEmails].filter((email) => email !== author);
    } else {
      recipients = [];
    }

    if (options.authorClerkId !== options.doc.ownerId) {
      const ownerEmail =
        options.ownerEmailOverride ??
        (await this.usersService.findEmailByClerkId(options.doc.ownerId));
      if (ownerEmail) {
        const ownerLower = ownerEmail.toLowerCase();
        if (ownerLower !== author && !recipients.includes(ownerLower)) {
          recipients.push(ownerLower);
        }
      }
    }

    return recipients;
  }

  private async notifyOtherParticipants(
    doc: DocumentDocument,
    authorClerkId: string,
    authorEmail: string,
    authorName: string | null,
    content: string,
    commentType: CreateCommentDto['type'],
    commentId: string,
    parentId: string | null,
    mentionedEmails: string[],
  ): Promise<void> {
    const author = authorEmail.toLowerCase();
    const namesByEmail = this.signerNamesByEmail(doc);
    const clerkIdsByEmail = this.signerClerkIdsByEmail(doc);

    let parentAuthorEmail: string | null = null;
    if (parentId) {
      const parent = await this.commentModel.findById(parentId).exec();
      parentAuthorEmail = parent?.authorEmail.toLowerCase() ?? null;
    }

    const recipients = await this.resolveCommentNotificationRecipients({
      doc,
      authorClerkId,
      authorEmail,
      commentType,
      mentionedEmails,
      parentId,
    });
    const commentPreview =
      content.length > 240 ? `${content.slice(0, 237)}...` : content;

    const inAppRecipients: CommentNotificationRecipient[] = [];

    await Promise.all(
      recipients.map(async (email) => {
        const isReply = !!parentAuthorEmail && email === parentAuthorEmail;
        const clerkId =
          clerkIdsByEmail.get(email) ??
          (await this.usersService.findClerkIdByEmail(email));

        inAppRecipients.push({
          email,
          name: namesByEmail.get(email) ?? null,
          clerkId,
          type: isReply ? 'comment_reply' : 'comment',
        });

        return this.notifications.enqueueCommentEmail({
          to: email,
          recipientName: namesByEmail.get(email) ?? email,
          documentTitle: doc.title,
          documentId: String(doc._id),
          authorName,
          authorEmail: author,
          commentPreview,
          isReply,
        });
      }),
    );

    const createdNotifications =
      await this.userNotifications.createCommentNotifications(inAppRecipients, {
        documentId: String(doc._id),
        documentTitle: doc.title,
        commentId,
        parentCommentId: parentId,
        authorName,
        authorEmail: author,
        contentPreview: commentPreview,
      });

    for (const { dto, clerkId } of createdNotifications) {
      if (clerkId) {
        this.gateway.emitToUser(clerkId, dto);
      }
    }
  }

  private async assertParticipant(
    documentId: string,
    clerkId: string,
    email: string,
  ): Promise<DocumentDocument> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const isParticipant =
      doc.ownerId === clerkId ||
      doc.participantClerkIds.includes(clerkId) ||
      doc.participantEmails.includes(email.toLowerCase());
    if (!isParticipant) throw new ForbiddenException();
    return doc;
  }

  private toDto(c: CommentDocument): CommentDto {
    const t = c as unknown as { createdAt: Date; updatedAt: Date };
    return {
      _id: String(c._id),
      documentId: String(c.documentId),
      authorId: c.authorId,
      authorEmail: c.authorEmail,
      authorName: c.authorName,
      content: c.content,
      mentionedEmails: c.mentionedEmails ?? [],
      pageNumber: c.pageNumber,
      x: c.x,
      y: c.y,
      type: c.type,
      resolved: c.resolved,
      resolvedBy: c.resolvedBy,
      parentId: c.parentId ? String(c.parentId) : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
