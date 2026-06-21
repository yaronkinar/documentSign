import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { WorkflowService } from './workflow.service';

interface FakeSigner {
  _id: string;
  email: string;
  status: string;
  clerkId: string | null;
  signedAt: Date | null;
}

interface FakeStep {
  _id: string;
  stepNumber: number;
  status: string;
  completedAt: Date | null;
  executionMode: 'sequential' | 'parallel';
  signers: FakeSigner[];
}

interface FakeWorkflowSteps extends Array<FakeStep> {
  id: (id: string) => FakeStep | undefined;
}

function buildFinalStepDoc(
  signers: FakeSigner[] = [
    {
      _id: 's1',
      email: 'a@test.com',
      status: 'pending',
      clerkId: null,
      signedAt: null,
    },
  ],
  executionMode: 'sequential' | 'parallel' = 'parallel',
) {
  const steps: FakeStep[] = [
    {
      _id: 'step1',
      stepNumber: 1,
      status: 'in_progress',
      completedAt: null,
      executionMode,
      signers,
    },
  ];
  const workflowSteps = steps as FakeWorkflowSteps;
  workflowSteps.id = (id: string) =>
    workflowSteps.find((s) => String(s._id) === String(id));

  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    status: 'pending_signature',
    workflowSteps,
    participantClerkIds: [] as string[],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function buildService(options: { commentCount: number; doc: unknown }) {
  const documentModel = {
    findById: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(options.doc) }),
  };
  const userModel = {};
  const commentModel = {
    countDocuments: jest.fn().mockResolvedValue(options.commentCount),
  };
  const invitesService = { sendStepInvites: jest.fn() };
  const auditService = { log: jest.fn() };
  const gateway = { emit: jest.fn() };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new WorkflowService(
    documentModel as never,
    userModel as never,
    commentModel as never,
    invitesService as never,
    auditService as never,
    gateway as never,
    queue as never,
  );

  return { service, documentModel, commentModel, invitesService, auditService, gateway };
}

describe('WorkflowService.recordSignature - comment resolution gate', () => {
  it('blocks final approval and does not persist when unresolved comments exist', async () => {
    const doc = buildFinalStepDoc();
    const { service } = buildService({ commentCount: 1, doc });

    await expect(
      service.recordSignature(String(doc._id), 'step1', 'a@test.com', null, null),
    ).rejects.toThrow(BadRequestException);

    expect(doc.save).not.toHaveBeenCalled();
    expect(doc.status).toBe('pending_signature');
  });

  it('approves the document when no unresolved comments remain', async () => {
    const doc = buildFinalStepDoc();
    const { service } = buildService({ commentCount: 0, doc });

    await service.recordSignature(String(doc._id), 'step1', 'a@test.com', null, null);

    expect(doc.status).toBe('approved');
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('WorkflowService.skipSigner - comment resolution gate', () => {
  it('blocks final approval when unresolved comments exist', async () => {
    const doc = buildFinalStepDoc();
    const { service } = buildService({ commentCount: 1, doc });

    await expect(
      service.skipSigner(String(doc._id), 'step1', 'a@test.com', 'owner1', 'owner@test.com'),
    ).rejects.toThrow(BadRequestException);

    expect(doc.status).toBe('pending_signature');
  });

  it('approves the document when no unresolved comments remain', async () => {
    const doc = buildFinalStepDoc();
    const { service } = buildService({ commentCount: 0, doc });

    await service.skipSigner(
      String(doc._id),
      'step1',
      'a@test.com',
      'owner1',
      'owner@test.com',
    );

    expect(doc.status).toBe('approved');
  });
});

describe('WorkflowService.recordSignature - sequential turn order', () => {
  it('rejects a sign attempt from a signer who is not yet active', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await expect(
      service.recordSignature(String(doc._id), 'step1', 'b@test.com', null, null),
    ).rejects.toThrow(BadRequestException);

    expect(doc.workflowSteps[0].signers[1].status).toBe('pending');
  });

  it('invites the next signer once the active signer signs', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service, invitesService } = buildService({ commentCount: 0, doc });

    await service.recordSignature(String(doc._id), 'step1', 'a@test.com', null, null);

    expect(doc.workflowSteps[0].signers[0].status).toBe('signed');
    expect(invitesService.sendStepInvites).toHaveBeenCalledWith(doc, doc.workflowSteps[0]);
  });

  it('allows any pending signer to sign in parallel mode', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'parallel',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await service.recordSignature(String(doc._id), 'step1', 'b@test.com', null, null);

    expect(doc.workflowSteps[0].signers[1].status).toBe('signed');
  });
});

describe('WorkflowService.recordRejection - sequential turn order', () => {
  it('rejects a rejection attempt from a signer who is not yet active', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await expect(
      service.recordRejection(String(doc._id), 'step1', 'b@test.com', 'no', null, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not advance the chain when the active signer rejects', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service, invitesService } = buildService({ commentCount: 0, doc });

    await service.recordRejection(String(doc._id), 'step1', 'a@test.com', 'no', null, null);

    expect(doc.workflowSteps[0].signers[0].status).toBe('rejected');
    expect(invitesService.sendStepInvites).not.toHaveBeenCalled();
  });
});
