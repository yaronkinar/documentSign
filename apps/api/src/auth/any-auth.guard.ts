import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ClerkAuthGuard } from './clerk.guard';
import { InviteGuard } from './invite.guard';

/**
 * Tries Clerk Bearer auth first; if no Authorization header present,
 * falls back to InviteGuard (?token=...). Used by endpoints that accept
 * both registered users and guest signers.
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

    if (hasBearer) {
      return this.clerkGuard.canActivate(context);
    }
    if (typeof req.query?.token === 'string' && req.query.token) {
      return this.inviteGuard.canActivate(context);
    }
    throw new UnauthorizedException('No credentials provided');
  }
}
