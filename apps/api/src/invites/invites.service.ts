import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

import { Document, DocumentDocument } from '../documents/document.schema';
import type { WorkflowStep } from '../documents/document.schema';
import { findSignerOnStep } from '../documents/signer.utils';
import {
  NotificationsService,
  type SendInviteEmailJob,
} from '../notifications/notifications.service';

const TOKEN_TTL_HOURS = 72;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class InvitesService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Creates a JWT (raw) + bcrypt hash for storage. Returns both -
   * raw goes in the email link, hash goes to the DB on the signer subdoc.
   */
  async generateInviteToken(
    documentId: string,
    signerEmail: string,
    stepId: string,
  ): Promise<{ token: string; tokenHash: string; expiry: Date }> {
    const secret = process.env.INVITE_TOKEN_SECRET;
    if (!secret) throw new Error('INVITE_TOKEN_SECRET not set');

    const token = jwt.sign(
      { documentId, signerEmail, stepId },
      secret,
      { expiresIn: `${TOKEN_TTL_HOURS}h` },
    );
    const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
    const expiry = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
    return { token, tokenHash, expiry };
  }

  /**
   * For every pending signer in a step, generate a fresh token + queue the
   * invite email. Saves the document with new hashes.
   */
  async sendStepInvites(
    doc: DocumentDocument,
    step: WorkflowStep,
  ): Promise<void> {
    const pending = step.signers.filter((s) => s.status === 'pending');
    if (pending.length === 0) return;

    const jobs: SendInviteEmailJob[] = [];
    for (const signer of pending) {
      const { token, tokenHash, expiry } = await this.generateInviteToken(
        String(doc._id),
        signer.email,
        String(step._id),
      );
      signer.inviteTokenHash = tokenHash;
      signer.inviteExpiry = expiry;
      signer.inviteSentAt = new Date();
      jobs.push({
        to: signer.email,
        signerName: signer.name ?? signer.email,
        documentTitle: doc.title,
        documentId: String(doc._id),
        token,
      });
    }

    await doc.save();

    for (const job of jobs) {
      await this.notifications.enqueueInviteEmail(job);
    }
  }

  /**
   * Regenerate a single signer's token (invalidates the old hash by overwriting)
   * and re-queue the email. Owner-only.
   */
  async resendInvite(
    documentId: string,
    stepId: string,
    signerId: string,
    requestorClerkId: string,
    signerEmail?: string,
  ): Promise<void> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== requestorClerkId) {
      throw new ForbiddenException('Only the owner can resend invites');
    }
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    const signer = findSignerOnStep(step, signerId, signerEmail);
    if (!signer) throw new NotFoundException('Signer not found');
    if (signer.status !== 'pending') {
      throw new ForbiddenException('Signer is not in a pending state');
    }

    const { token, tokenHash, expiry } = await this.generateInviteToken(
      String(doc._id),
      signer.email,
      String(step._id),
    );
    signer.inviteTokenHash = tokenHash;
    signer.inviteExpiry = expiry;
    signer.inviteSentAt = new Date();
    await doc.save();

    await this.notifications.enqueueInviteEmail({
      to: signer.email,
      signerName: signer.name ?? signer.email,
      documentTitle: doc.title,
      documentId: String(doc._id),
      token,
    });
  }

  /**
   * After a signer’s email changes, invalidate old invite JWTs and email a fresh
   * signing link for every pending invite that was already sent.
   */
  async refreshInvitesAfterEmailChange(
    clerkId: string,
    newEmail: string,
  ): Promise<void> {
    const neu = newEmail.toLowerCase();
    const docs = await this.documentModel
      .find({
        'workflowSteps.signers': {
          $elemMatch: {
            status: 'pending',
            $or: [{ clerkId }, { email: neu }],
          },
        },
      })
      .exec();

    for (const doc of docs) {
      const jobs: SendInviteEmailJob[] = [];
      let changed = false;

      for (const step of doc.workflowSteps) {
        const stepLive =
          step.status === 'in_progress' || step.status === 'pending';
        if (!stepLive) continue;

        for (const signer of step.signers) {
          if (signer.status !== 'pending') continue;
          if (signer.clerkId !== clerkId && signer.email !== neu) continue;
          if (!signer.inviteSentAt && step.status !== 'in_progress') continue;

          const { token, tokenHash, expiry } = await this.generateInviteToken(
            String(doc._id),
            signer.email,
            String(step._id),
          );
          signer.inviteTokenHash = tokenHash;
          signer.inviteExpiry = expiry;
          signer.inviteSentAt = new Date();
          changed = true;
          jobs.push({
            to: signer.email,
            signerName: signer.name ?? signer.email,
            documentTitle: doc.title,
            documentId: String(doc._id),
            token,
          });
        }
      }

      if (changed) await doc.save();

      for (const job of jobs) {
        await this.notifications.enqueueInviteEmail(job);
      }
    }
  }
}
