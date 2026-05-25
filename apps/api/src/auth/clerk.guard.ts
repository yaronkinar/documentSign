import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient, verifyToken } from '@clerk/backend';

import { UsersService } from '../users/users.service';

/**
 * Verifies a Clerk-issued JWT from the `Authorization: Bearer <token>` header.
 * On success sets:
 *   req.clerkUserId  = payload.sub
 *   req.actorEmail   = resolved email (JWT claim, DB, or Clerk API)
 *   req.actorName    = optional name claim
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private secretKey: string;
  private clerk: ReturnType<typeof createClerkClient>;

  constructor(private readonly usersService: UsersService) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error('CLERK_SECRET_KEY is not set');
    }
    this.secretKey = secretKey;
    this.clerk = createClerkClient({ secretKey });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    const bypassToken = process.env.BYPASS_TOKEN;
    if (process.env.BYPASS_AUTH === 'true' && bypassToken && token === bypassToken) {
      req.clerkUserId = 'bypass-dev-user';
      req.actorEmail = process.env.BYPASS_AUTH_EMAIL ?? 'test@example.com';
      req.actorName = 'Dev User';
      return true;
    }

    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey });
      req.clerkUserId = payload.sub;

      const claims = payload as Record<string, unknown>;
      const jwtEmail = this.emailFromClaims(claims);
      let name =
        (typeof claims.name === 'string' && claims.name) ||
        (typeof claims.full_name === 'string' && claims.full_name) ||
        null;

      const dbEmail = await this.usersService.findEmailByClerkId(payload.sub);
      let email = dbEmail;

      if (!email) {
        const resolved = await this.resolveFromClerk(payload.sub);
        email = resolved.email;
        if (!name) name = resolved.name;
      } else if (
        jwtEmail &&
        jwtEmail.toLowerCase() !== email.toLowerCase()
      ) {
        const resolved = await this.resolveFromClerk(payload.sub);
        email = resolved.email ?? email;
        if (!name) name = resolved.name;
      } else if (!jwtEmail) {
        const resolved = await this.resolveFromClerk(payload.sub);
        if (resolved.email) email = resolved.email;
        if (!name) name = resolved.name;
      }

      req.actorEmail = email ?? jwtEmail;
      req.actorName = name;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid Clerk token');
    }
  }

  private emailFromClaims(claims: Record<string, unknown>): string | null {
    if (typeof claims.email === 'string' && claims.email) return claims.email;
    if (
      typeof claims.primary_email_address === 'string' &&
      claims.primary_email_address
    ) {
      return claims.primary_email_address;
    }
    return null;
  }

  private async resolveFromClerk(
    clerkUserId: string,
  ): Promise<{ email: string | null; name: string | null }> {
    try {
      const user = await this.clerk.users.getUser(clerkUserId);
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        null;
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        null;

      if (email) {
        await this.usersService.upsertFromClerk({
          clerkId: clerkUserId,
          email,
          name: name ?? email,
          avatarUrl: user.imageUrl,
        });
      }

      return { email, name };
    } catch {
      return { email: null, name: null };
    }
  }
}
