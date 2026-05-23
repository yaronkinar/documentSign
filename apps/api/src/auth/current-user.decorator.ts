import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  clerkId: string;
  email: string | null;
  name: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const req = ctx.switchToHttp().getRequest();
    return {
      clerkId: req.clerkUserId,
      email: req.actorEmail ?? null,
      name: req.actorName ?? null,
    };
  },
);
