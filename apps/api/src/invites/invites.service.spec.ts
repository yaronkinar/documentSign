import { InvitesService } from './invites.service';

function buildStep(executionMode: 'sequential' | 'parallel') {
  return {
    _id: 'step1',
    executionMode,
    signers: [
      { _id: 's1', email: 'a@test.com', name: null, status: 'pending', inviteTokenHash: null, inviteExpiry: null, inviteSentAt: null },
      { _id: 's2', email: 'b@test.com', name: null, status: 'pending', inviteTokenHash: null, inviteExpiry: null, inviteSentAt: null },
    ],
  };
}

function buildDoc() {
  return {
    _id: 'doc1',
    title: 'Test doc',
    save: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function buildService() {
  const documentModel = {};
  const notifications = { enqueueInviteEmail: jest.fn().mockResolvedValue(undefined) };
  process.env.INVITE_TOKEN_SECRET = 'test-secret';
  const service = new InvitesService(documentModel as never, notifications as never);
  return { service, notifications };
}

describe('InvitesService.sendStepInvites - sequential gating', () => {
  it('invites only the first signer when executionMode is sequential', async () => {
    const step = buildStep('sequential');
    const doc = buildDoc();
    const { service, notifications } = buildService();

    await service.sendStepInvites(doc, step as never);

    expect(notifications.enqueueInviteEmail).toHaveBeenCalledTimes(1);
    expect(notifications.enqueueInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com' }),
    );
    expect(step.signers[1].inviteSentAt).toBeNull();
  });

  it('invites every pending signer when executionMode is parallel', async () => {
    const step = buildStep('parallel');
    const doc = buildDoc();
    const { service, notifications } = buildService();

    await service.sendStepInvites(doc, step as never);

    expect(notifications.enqueueInviteEmail).toHaveBeenCalledTimes(2);
  });
});
