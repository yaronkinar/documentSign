import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface InviteContextPayload {
  signerEmail: string;
  documentId: string;
  stepId: string;
  isGuest: true;
}

export const InviteContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InviteContextPayload => {
    const req = ctx.switchToHttp().getRequest();
    return {
      signerEmail: req.signerEmail,
      documentId: req.documentId,
      stepId: req.stepId,
      isGuest: true,
    };
  },
);
