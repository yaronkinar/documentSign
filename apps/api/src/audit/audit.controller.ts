import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuditEventDto } from '@docflow/shared';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { Document, DocumentDocument } from '../documents/document.schema';
import { AuditService } from './audit.service';

@Controller()
@UseGuards(ClerkAuthGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
  ) {}

  @Get('documents/:id/audit')
  async listForDocument(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AuditEventDto[]> {
    const doc = await this.documentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Document not found');

    const isParticipant =
      doc.ownerId === user.clerkId ||
      doc.participantClerkIds.includes(user.clerkId) ||
      (user.email !== null && doc.participantEmails.includes(user.email));
    if (!isParticipant) throw new ForbiddenException();

    const events = await this.auditService.listForDocument(id);
    return events.map((e) => ({
      _id: String(e._id),
      documentId: String(e.documentId),
      actorId: e.actorId,
      actorEmail: e.actorEmail,
      actorName: e.actorName,
      eventType: e.eventType,
      metadata: e.metadata,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
