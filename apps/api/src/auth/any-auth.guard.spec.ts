import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { AnyAuthGuard } from './any-auth.guard';
import type { ClerkAuthGuard } from './clerk.guard';
import type { InviteGuard } from './invite.guard';

interface FakeRequest {
  headers: Record<string, string>;
  query: Record<string, string>;
  signerEmail?: string;
  actorEmail?: string;
  actorName?: string | null;
  clerkUserId?: string;
  isGuest?: boolean;
  documentId?: string;
  stepId?: string;
}

function ctxFor(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** Mirrors what the real InviteGuard writes onto the request. */
function fakeInviteGuard(): InviteGuard {
  return {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<FakeRequest>();
      req.signerEmail = 'signer@example.com';
      req.documentId = 'doc1';
      req.stepId = 'step1';
      req.isGuest = true;
      req.actorEmail = 'Signer@Example.com';
      return Promise.resolve(true);
    },
  } as unknown as InviteGuard;
}

/** Mirrors what the real ClerkAuthGuard writes onto the request. */
function fakeClerkGuard(
  result: { clerkUserId: string; actorEmail: string; actorName?: string } | Error,
): ClerkAuthGuard {
  return {
    canActivate: (context: ExecutionContext) => {
      if (result instanceof Error) return Promise.reject(result);
      const req = context.switchToHttp().getRequest<FakeRequest>();
      req.clerkUserId = result.clerkUserId;
      req.actorEmail = result.actorEmail;
      req.actorName = result.actorName ?? null;
      return Promise.resolve(true);
    },
  } as unknown as ClerkAuthGuard;
}

describe('AnyAuthGuard', () => {
  it('rejects a request with neither a bearer token nor an invite token', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard(new Error('should not run')),
      fakeInviteGuard(),
    );
    const req: FakeRequest = { headers: {}, query: {} };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses Clerk auth when only a bearer token is present', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard({ clerkUserId: 'user_1', actorEmail: 'signer@example.com' }),
      fakeInviteGuard(),
    );
    const req: FakeRequest = { headers: { authorization: 'Bearer abc' }, query: {} };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.clerkUserId).toBe('user_1');
    expect(req.isGuest).toBeUndefined();
  });

  it('treats a bare invite token as a guest signer', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard(new Error('should not run')),
      fakeInviteGuard(),
    );
    const req: FakeRequest = { headers: {}, query: { token: 'invite-jwt' } };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.isGuest).toBe(true);
    expect(req.clerkUserId).toBeUndefined();
  });

  it('links the Clerk account when a signed-in user opens their own email link', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard({
        clerkUserId: 'user_1',
        actorEmail: 'Signer@Example.com',
        actorName: 'Signer One',
      }),
      fakeInviteGuard(),
    );
    const req: FakeRequest = {
      headers: { authorization: 'Bearer abc' },
      query: { token: 'invite-jwt' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    // The invite token still authorises the request...
    expect(req.stepId).toBe('step1');
    expect(req.documentId).toBe('doc1');
    // ...but the signature is attributed to the account, not to a guest.
    expect(req.isGuest).toBe(false);
    expect(req.clerkUserId).toBe('user_1');
    expect(req.actorName).toBe('Signer One');
    // Canonical (lower-cased) signer email, so the email equality check in
    // SignaturesService.placeSignature still matches.
    expect(req.actorEmail).toBe('signer@example.com');
  });

  it('stays a guest when the signed-in user is not the invited signer', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard({
        clerkUserId: 'user_2',
        actorEmail: 'someone-else@example.com',
        actorName: 'Someone Else',
      }),
      fakeInviteGuard(),
    );
    const req: FakeRequest = {
      headers: { authorization: 'Bearer abc' },
      query: { token: 'invite-jwt' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.isGuest).toBe(true);
    expect(req.clerkUserId).toBeUndefined();
    expect(req.actorEmail).toBe('Signer@Example.com');
  });

  it('falls back to guest signing when the Clerk token is invalid', async () => {
    const guard = new AnyAuthGuard(
      fakeClerkGuard(new UnauthorizedException('Invalid Clerk token')),
      fakeInviteGuard(),
    );
    const req: FakeRequest = {
      headers: { authorization: 'Bearer expired' },
      query: { token: 'invite-jwt' },
    };

    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.isGuest).toBe(true);
    expect(req.clerkUserId).toBeUndefined();
    expect(req.actorEmail).toBe('Signer@Example.com');
  });

  it('rejects when the invite token is invalid, even with a valid bearer token', async () => {
    const badInvite = {
      canActivate: () =>
        Promise.reject(new UnauthorizedException('Invalid or expired invite token')),
    } as unknown as InviteGuard;
    const guard = new AnyAuthGuard(
      fakeClerkGuard({ clerkUserId: 'user_1', actorEmail: 'signer@example.com' }),
      badInvite,
    );
    const req: FakeRequest = {
      headers: { authorization: 'Bearer abc' },
      query: { token: 'tampered' },
    };

    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
