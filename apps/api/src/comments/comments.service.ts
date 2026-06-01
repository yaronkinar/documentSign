import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEventType, type CommentDto } from '@docflow/shared';

import { Comment, CommentDocument } from './comment.schema';
import { Document, DocumentDocument } from '../documents/document.schema';
import { AuditService } from '../audit/audit.service';
import { WorkflowGateway } from '../workflow/workflow.gateway';
import { CreateCommentDto } from './comments.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    private readonly auditService: AuditService,
    private readonly gateway: WorkflowGateway,
  ) {}

  async addComment(
    documentId: string,
    dto: CreateCommentDto,
    actorId: string,
    actorEmail: string,
    actorName: string | null,
  ): Promise<CommentDto> {
    const doc = await this.assertParticipant(documentId, actorId, actorEmail);
    const created = await this.commentModel.create({
      documentId: doc._id,
      authorId: actorId,
      authorEmail: actorEmail.toLowerCase(),
      authorName: actorName?.trim() || null,
      content: dto.content,
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
