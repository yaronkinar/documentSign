import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

import { Document, DocumentDocument } from '../documents/document.schema';

interface InvitePayload {
  documentId: string;
  signerEmail: string;
  stepId: string;
  iat?: number;
  exp?: number;
}

/**
 * Validates a guest invite token passed as ?token=... query param.
 *   1. JWT verify against INVITE_TOKEN_SECRET (catches expiry too)
 *   2. Look up the document + step + signer
 *   3. bcrypt.compare the raw token against signer.inviteTokenHash
 * On success sets:
 *   req.signerEmail, req.documentId, req.stepId, req.isGuest = true
 *   req.actorEmail = signer email (so audit logging works uniformly)
 */
@Injectable()
export class InviteGuard implements CanActivate {
  constructor(
    @InjectModel(Document.name) private documentModel: Model<DocumentDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token: unknown = req.query?.token;
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Missing invite token');
    }

    const secret = process.env.INVITE_TOKEN_SECRET;
    if (!secret) {
      throw new Error('INVITE_TOKEN_SECRET is not set');
    }

    let payload: InvitePayload;
    try {
      payload = jwt.verify(token, secret) as InvitePayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired invite token');
    }

    const doc = await this.documentModel.findById(payload.documentId).exec();
    if (!doc) {
      throw new UnauthorizedException('Document not found');
    }
    const step = doc.workflowSteps.id(payload.stepId);
    if (!step) {
      throw new UnauthorizedException('Workflow step not found');
    }
    const payloadEmail = payload.signerEmail.toLowerCase();
    let signer = step.signers.find((s) => s.email === payloadEmail);
    if (signer?.inviteTokenHash) {
      const match = await bcrypt.compare(token, signer.inviteTokenHash);
      if (!match) signer = undefined;
    } else {
      signer = undefined;
    }

    if (!signer) {
      for (const s of step.signers) {
        if (!s.inviteTokenHash) continue;
        if (await bcrypt.compare(token, s.inviteTokenHash)) {
          signer = s;
          break;
        }
      }
    }

    if (!signer) {
      throw new UnauthorizedException('Signer not found');
    }

    req.signerEmail = signer.email;
    req.documentId = payload.documentId;
    req.stepId = payload.stepId;
    req.isGuest = true;
    req.actorEmail = payload.signerEmail;
    return true;
  }
}
