import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ClerkAuthGuard } from './clerk.guard';
import { InviteGuard } from './invite.guard';

/**
 * Accepts either Clerk Bearer auth (registered) or ?token=... (guest).
 * Used by endpoints that serve both registered users and guest signers.
 *
 * When BOTH are present - a signed-in user following their emailed sign link -
 * the invite token remains the source of authorisation, and the Clerk identity
 * is attached on top so the signature is attributed to their account instead of
 * being recorded anonymously.
 */
@Injectable()
export class AnyAuthGuard implements CanActivate {
  constructor(
    private readonly clerkGuard: ClerkAuthGuard,
    private readonly inviteGuard: InviteGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const hasBearer =
      typeof req.headers?.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ');
    const hasInviteToken =
      typeof req.query?.token === 'string' && req.query.token;

    if (hasInviteToken) {
      await this.inviteGuard.canActivate(context);
      if (hasBearer) {
        await this.attachClerkIdentity(context, req);
      }
      return true;
    }
    if (hasBearer) {
      return this.clerkGuard.canActivate(context);
    }
    throw new UnauthorizedException('No credentials provided');
  }

  /**
   * Best-effort: the invite token already authorised this request, so a stale
   * or foreign session must never turn a valid sign attempt into a 401 - it
   * just falls back to signing as a guest.
   */
  private async attachClerkIdentity(
    context: ExecutionContext,
    req: {
      signerEmail: string;
      actorEmail?: string;
      actorName?: string | null;
      clerkUserId?: string;
      isGuest?: boolean;
    },
  ): Promise<void> {
    const invitedEmail = req.signerEmail;
    const inviteActorEmail = req.actorEmail;

    try {
      await this.clerkGuard.canActivate(context);
    } catch {
      this.revertToGuest(req, inviteActorEmail);
      return;
    }

    const clerkEmail =
      typeof req.actorEmail === 'string' ? req.actorEmail.toLowerCase() : null;
    if (!clerkEmail || clerkEmail !== invitedEmail.toLowerCase()) {
      // Signed in as somebody else (e.g. a shared device) - the link still
      // works, but it signs for the invited signer, as a guest.
      this.revertToGuest(req, inviteActorEmail);
      return;
    }

    req.isGuest = false;
    // Use the stored signer email so the equality check in
    // SignaturesService.placeSignature is not defeated by casing.
    req.actorEmail = invitedEmail;
  }

  private revertToGuest(
    req: { actorEmail?: string; actorName?: string | null; clerkUserId?: string },
    inviteActorEmail: string | undefined,
  ): void {
    req.clerkUserId = undefined;
    req.actorName = undefined;
    req.actorEmail = inviteActorEmail;
  }
}
