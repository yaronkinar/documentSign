import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuditEventType } from '@docflow/shared';

import { AuditEvent, AuditEventDocument } from './audit-event.schema';

export interface LogAuditDto {
  documentId: string | Types.ObjectId;
  actorId?: string | null;
  actorEmail: string;
  actorName?: string | null;
  eventType: AuditEventType;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditEvent.name)
    private readonly auditModel: Model<AuditEventDocument>,
  ) {}

  /**
   * Fire-and-forget. Never throws. Callers should not await blocking.
   */
  log(data: LogAuditDto): void {
    this.auditModel
      .create({
        documentId:
          typeof data.documentId === 'string'
            ? new Types.ObjectId(data.documentId)
            : data.documentId,
        actorId: data.actorId ?? null,
        actorEmail: data.actorEmail,
        actorName: data.actorName ?? null,
        eventType: data.eventType,
        metadata: data.metadata ?? null,
        ipAddress: data.ipAddress ?? null,
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[audit] log failed', err);
      });
  }

  async listForDocument(documentId: string): Promise<AuditEventDocument[]> {
    return this.auditModel
      .find({ documentId: new Types.ObjectId(documentId) })
      .sort({ createdAt: 1 })
      .exec();
  }
}
