import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';

import { findSignerOnStep } from '../documents/signer.utils';
import { User, UserDocument } from '../users/user.schema';
import { AuditEventType, missingTemplateFieldMappings, type DocumentStatus } from '@docflow/shared';

import { Document, DocumentDocument, WorkflowStep } from '../documents/document.schema';
import { InvitesService } from '../invites/invites.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowGateway } from './workflow.gateway';
import { AddStepDto, AddSignerDto } from './workflow.dto';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.constants';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly invitesService: InvitesService,
    private readonly auditService: AuditService,
    private readonly gateway: WorkflowGateway,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Transition: draft -> pending_review / pending_signature; start step 1. */
  async submitDocument(
    documentId: string,
    clerkId: string,
    actorEmail: string,
  ): Promise<DocumentDocument> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.status !== 'draft') {
      throw new BadRequestException('Document is not in draft state');
    }
    if (doc.workflowSteps.length === 0) {
      throw new BadRequestException('Add at least one workflow step');
    }
    const firstStep = doc.workflowSteps[0];
    if (firstStep.signers.length === 0) {
      throw new BadRequestException('First step has no signers');
    }

    this.syncTemplateSignatureFields(doc);
    this.assertAllSignersMapped(doc);

    const previousStatus = doc.status;
    const newStatus: DocumentStatus =
      firstStep.stepType === 'review' ? 'pending_review' : 'pending_signature';
    doc.status = newStatus;
    doc.currentStep = 1;
    firstStep.status = 'in_progress';
    await doc.save();

    await this.invitesService.sendStepInvites(doc, firstStep);

    this.gateway.emit('document:status_changed', {
      documentId: String(doc._id),
      newStatus,
      previousStatus,
    });
    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.StatusChanged,
      metadata: { from: previousStatus, to: newStatus },
    });
    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.StepStarted,
      metadata: { stepNumber: firstStep.stepNumber, stepId: String(firstStep._id) },
    });
    return doc;
  }

  async recordSignature(
    documentId: string,
    stepId: string,
    signerEmail: string,
    actorId: string | null,
    actorName: string | null,
    signerDocumentId?: string,
  ): Promise<void> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    if (step.status !== 'in_progress') {
      throw new BadRequestException('Step is not active');
    }
    const signer = signerDocumentId
      ? findSignerOnStep(step, signerDocumentId, signerEmail)
      : step.signers.find(
          (s) => s.email === signerEmail && s.status === 'pending',
        );
    if (!signer) throw new NotFoundException('Signer not found');
    if (signer.status !== 'pending') {
      throw new BadRequestException('Signer is not pending');
    }

    signer.status = 'signed';
    signer.signedAt = new Date();
    // If signer was a guest who has since registered, capture clerkId
    if (actorId && !signer.clerkId) {
      signer.clerkId = actorId;
      if (!doc.participantClerkIds.includes(actorId)) {
        doc.participantClerkIds.push(actorId);
      }
    }

    this.auditService.log({
      documentId: doc._id,
      actorId,
      actorEmail: signerEmail,
      actorName,
      eventType: AuditEventType.Signed,
      metadata: { stepId: String(step._id), stepNumber: step.stepNumber },
    });

    this.gateway.emit('signer:signed', {
      documentId: String(doc._id),
      stepId: String(step._id),
      signerEmail,
      signedAt: signer.signedAt.toISOString(),
    });

    const allDone = step.signers.every(
      (s) => s.status === 'signed' || s.status === 'skipped',
    );

    if (allDone) {
      step.status = 'completed';
      step.completedAt = new Date();
      this.gateway.emit('step:completed', {
        documentId: String(doc._id),
        stepId: String(step._id),
        stepNumber: step.stepNumber,
      });
      this.auditService.log({
        documentId: doc._id,
        actorId,
        actorEmail: signerEmail,
        eventType: AuditEventType.StepCompleted,
        metadata: { stepId: String(step._id), stepNumber: step.stepNumber },
      });

      const nextStep = doc.workflowSteps.find(
        (s) => s.stepNumber === step.stepNumber + 1,
      );
      if (nextStep) {
        const previousStatus = doc.status;
        nextStep.status = 'in_progress';
        doc.currentStep = nextStep.stepNumber;
        const newStatus: DocumentStatus =
          nextStep.stepType === 'review' ? 'pending_review' : 'pending_signature';
        if (doc.status !== newStatus) {
          doc.status = newStatus;
          this.gateway.emit('document:status_changed', {
            documentId: String(doc._id),
            newStatus,
            previousStatus,
          });
        }
        await doc.save();
        await this.invitesService.sendStepInvites(doc, nextStep);
        this.auditService.log({
          documentId: doc._id,
          actorId,
          actorEmail: signerEmail,
          eventType: AuditEventType.StepStarted,
          metadata: { stepId: String(nextStep._id), stepNumber: nextStep.stepNumber },
        });
      } else {
        const previousStatus = doc.status;
        doc.status = 'approved';
        await doc.save();
        this.gateway.emit('document:status_changed', {
          documentId: String(doc._id),
          newStatus: 'approved',
          previousStatus,
        });
        this.auditService.log({
          documentId: doc._id,
          actorId,
          actorEmail: signerEmail,
          eventType: AuditEventType.StatusChanged,
          metadata: { from: previousStatus, to: 'approved' },
        });
      }
    } else {
      await doc.save();
    }
  }

  async recordRejection(
    documentId: string,
    stepId: string,
    signerEmail: string,
    reason: string,
    actorId: string | null,
    actorName: string | null,
  ): Promise<void> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    const signer = step.signers.find((s) => s.email === signerEmail);
    if (!signer) throw new NotFoundException('Signer not found');
    if (signer.status !== 'pending') {
      throw new BadRequestException('Signer already responded');
    }

    signer.status = 'rejected';
    signer.rejectionReason = reason;
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId,
      actorEmail: signerEmail,
      actorName,
      eventType: AuditEventType.Rejected,
      metadata: { stepId: String(step._id), reason },
    });

    this.gateway.emit('signer:rejected', {
      documentId: String(doc._id),
      stepId: String(step._id),
      signerEmail,
      reason,
    });

    // Notify owner via email (fire-and-forget queue)
    await this.queue
      .add(
        'notify-rejection',
        {
          ownerEmail: doc.ownerId, // owner notification - real email looked up downstream
          documentTitle: doc.title,
          documentId: String(doc._id),
          signerEmail,
          reason,
        },
        { attempts: 2, removeOnComplete: true },
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[workflow] enqueue rejection notify failed', err);
      });
  }

  async skipSigner(
    documentId: string,
    stepId: string,
    signerId: string,
    ownerClerkId: string,
    actorEmail: string,
    signerEmailParam?: string,
  ): Promise<void> {
    const doc = await this.findOwnedDocument(documentId, ownerClerkId);
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    const signer = findSignerOnStep(step, signerId, signerEmailParam);
    if (!signer) throw new NotFoundException('Signer not found');
    const signerEmail = signer.email;
    if (signer.status !== 'pending') {
      throw new BadRequestException('Signer is not pending');
    }
    signer.status = 'skipped';
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId: ownerClerkId,
      actorEmail,
      eventType: AuditEventType.SignerSkipped,
      metadata: { stepId: String(step._id), signerEmail },
    });

    // Re-check step completion in case this signer was the last blocker
    const allDone = step.signers.every(
      (s) => s.status === 'signed' || s.status === 'skipped',
    );
    if (allDone) {
      // Delegate to recordSignature-style completion by triggering a no-op
      // signer sign on a virtual "system" signer - simpler to inline:
      step.status = 'completed';
      step.completedAt = new Date();
      this.gateway.emit('step:completed', {
        documentId: String(doc._id),
        stepId: String(step._id),
        stepNumber: step.stepNumber,
      });
      const nextStep = doc.workflowSteps.find(
        (s) => s.stepNumber === step.stepNumber + 1,
      );
      if (nextStep) {
        const previousStatus = doc.status;
        nextStep.status = 'in_progress';
        doc.currentStep = nextStep.stepNumber;
        doc.status =
          nextStep.stepType === 'review' ? 'pending_review' : 'pending_signature';
        await doc.save();
        await this.invitesService.sendStepInvites(doc, nextStep);
        if (doc.status !== previousStatus) {
          this.gateway.emit('document:status_changed', {
            documentId: String(doc._id),
            newStatus: doc.status,
            previousStatus,
          });
        }
      } else {
        const previousStatus = doc.status;
        doc.status = 'approved';
        await doc.save();
        this.gateway.emit('document:status_changed', {
          documentId: String(doc._id),
          newStatus: 'approved',
          previousStatus,
        });
      }
    }
  }

  async addStep(
    documentId: string,
    dto: AddStepDto,
    clerkId: string,
    actorEmail: string,
  ): Promise<DocumentDocument> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (doc.status !== 'draft') {
      throw new BadRequestException('Cannot add steps after submission');
    }
    const stepNumber =
      doc.workflowSteps.reduce((max, s) => Math.max(max, s.stepNumber), 0) + 1;
    const signers = await Promise.all(
      dto.signers.map(async (s) => {
        const email = s.email.toLowerCase();
        const linkedClerkId = await this.findClerkIdByEmail(email);
        return {
          _id: new Types.ObjectId(),
          email,
          clerkId: linkedClerkId,
          name: s.name ?? null,
          status: 'pending' as const,
          inviteTokenHash: null,
          inviteExpiry: null,
          inviteSentAt: null,
          signedAt: null,
          rejectionReason: null,
        };
      }),
    );
    doc.workflowSteps.push({
      stepNumber,
      stepType: dto.stepType,
      label: dto.label,
      executionMode: dto.executionMode ?? 'parallel',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      status: 'pending',
      completedAt: null,
      signers,
    } as never);
    for (const s of signers) {
      if (!doc.participantEmails.includes(s.email)) {
        doc.participantEmails.push(s.email);
      }
      if (s.clerkId && !doc.participantClerkIds.includes(s.clerkId)) {
        doc.participantClerkIds.push(s.clerkId);
      }
    }
    this.syncTemplateSignatureFields(doc);
    await doc.save();
    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.SignerAdded,
      metadata: { stepNumber, signers: dto.signers.map((s) => s.email) },
    });
    return doc;
  }

  async addSigner(
    documentId: string,
    stepId: string,
    dto: AddSignerDto,
    clerkId: string,
    actorEmail: string,
  ): Promise<DocumentDocument> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    const step = doc.workflowSteps.id(stepId);
    if (!step) throw new NotFoundException('Step not found');
    if (step.status === 'completed' || step.status === 'skipped') {
      throw new BadRequestException('Cannot add signer to a finished step');
    }
    const email = dto.email.toLowerCase();
    if (step.signers.some((s) => s.email === email)) {
      throw new BadRequestException('Signer already on this step');
    }
    const linkedClerkId = await this.findClerkIdByEmail(email);
    step.signers.push({
      _id: new Types.ObjectId(),
      email,
      clerkId: linkedClerkId,
      name: dto.name ?? null,
      status: 'pending',
      inviteTokenHash: null,
      inviteExpiry: null,
      inviteSentAt: null,
      signedAt: null,
      rejectionReason: null,
    } as never);
    if (!doc.participantEmails.includes(email)) {
      doc.participantEmails.push(email);
    }
    if (linkedClerkId && !doc.participantClerkIds.includes(linkedClerkId)) {
      doc.participantClerkIds.push(linkedClerkId);
    }
    this.syncTemplateSignatureFields(doc);
    await doc.save();
    this.auditService.log({
      documentId: doc._id,
      actorId: clerkId,
      actorEmail,
      eventType: AuditEventType.SignerAdded,
      metadata: { stepId, signerEmail: email },
    });
    // If the step is already in_progress, send the new signer an invite now
    if (step.status === 'in_progress') {
      await this.invitesService.sendStepInvites(doc, step);
    }
    return doc;
  }

  private async findClerkIdByEmail(email: string): Promise<string | null> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('clerkId')
      .lean()
      .exec();
    return user?.clerkId ?? null;
  }

  private assertAllSignersMapped(doc: DocumentDocument): void {
    for (const step of doc.workflowSteps) {
      if (step.stepType !== 'signature' && step.stepType !== 'approval') {
        continue;
      }
      for (const signer of step.signers) {
        const mapped = (doc.signatureFields ?? []).some(
          (field) =>
            String(field.stepId) === String(step._id) &&
            String(field.signerId) === String(signer._id),
        );
        if (!mapped) {
          const label = signer.name ?? signer.email;
          throw new BadRequestException(
            `Assign a signature field to ${label} before sending invites`,
          );
        }
      }
    }
  }

  private syncTemplateSignatureFields(doc: DocumentDocument): void {
    if (!doc.formTemplateId) return;
    if (!doc.signatureFields) {
      doc.set('signatureFields', []);
    }

    const existing = doc.signatureFields.map((field) => ({
      stepId: String(field.stepId),
      signerId: String(field.signerId),
    }));

    const workflowSteps = doc.workflowSteps.map((step) => ({
      _id: String(step._id),
      stepType: step.stepType,
      label: step.label,
      signers: step.signers.map((signer) => ({
        _id: String(signer._id),
        email: signer.email,
        name: signer.name,
      })),
    }));

    const mappings = missingTemplateFieldMappings(
      doc.formTemplateId,
      workflowSteps,
      existing,
    );

    for (const mapping of mappings) {
      doc.signatureFields.push({
        stepId: new Types.ObjectId(mapping.stepId),
        signerId: new Types.ObjectId(mapping.signerId),
        pageNumber: mapping.pageNumber,
        x: mapping.x,
        y: mapping.y,
        width: mapping.width,
        height: mapping.height,
        label: mapping.label,
      } as never);
    }
  }

  private async findOwnedDocument(
    documentId: string,
    clerkId: string,
  ): Promise<DocumentDocument> {
    const doc = await this.documentModel.findById(documentId).exec();
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerId !== clerkId) throw new ForbiddenException('Not the owner');
    return doc;
  }
}
