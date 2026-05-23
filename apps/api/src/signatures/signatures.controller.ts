import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { InviteGuard } from '../auth/invite.guard';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { SignaturesService, SignerContext } from './signatures.service';
import { PlaceSignatureDto } from './signatures.dto';
import { RejectDocumentDto } from '../workflow/workflow.dto';

@Controller()
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  /**
   * Guest fetch of signing data. Always uses InviteGuard.
   */
  @Get('sign/:docId')
  @UseGuards(InviteGuard)
  async getGuestSigningData(@Param('docId') docId: string, @Req() req: Request) {
    const ireq = req as Request & {
      signerEmail: string;
      stepId: string;
      documentId: string;
    };
    if (ireq.documentId !== docId) {
      throw new BadRequestException('Document mismatch');
    }
    return this.signaturesService.getGuestSigningData(
      ireq.documentId,
      ireq.signerEmail,
      ireq.stepId,
    );
  }

  /**
   * Guest-only direct storage upload URL for a fresh signature image.
   * Registered users use /users/me/signatures/upload-url instead.
   */
  @Post('storage/upload-url/guest')
  @UseGuards(InviteGuard)
  guestUploadUrl(@Req() req: Request) {
    const ireq = req as Request & { signerEmail: string; documentId: string };
    return this.signaturesService.getGuestUploadUrl(
      ireq.documentId,
      ireq.signerEmail,
    );
  }

  @Post('documents/:id/signatures/upload-url')
  @UseGuards(ClerkAuthGuard)
  registeredUploadUrl(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.signaturesService.getRegisteredUploadUrl(
      id,
      user.clerkId,
      user.email,
    );
  }

  /**
   * Place a signature. Accepts either Clerk Bearer auth (registered)
   * or ?token=... (guest) via AnyAuthGuard.
   */
  @Post('documents/:id/sign')
  @UseGuards(AnyAuthGuard)
  async placeSignature(
    @Param('id') id: string,
    @Body() dto: PlaceSignatureDto,
    @Req() req: Request,
  ) {
    const ctx = buildSignerContext(req, id, dto.stepId);
    return this.signaturesService.placeSignature(dto, ctx);
  }

  @Post('documents/:id/reject')
  @UseGuards(AnyAuthGuard)
  async rejectDocument(
    @Param('id') id: string,
    @Body() dto: RejectDocumentDto,
    @Req() req: Request,
  ) {
    const ireq = req as Request & {
      stepId?: string;
      signerEmail?: string;
    };
    const stepId = ireq.stepId;
    if (!stepId) {
      throw new BadRequestException(
        'stepId not in context - registered-user reject must include stepId in body',
      );
    }
    const ctx = buildSignerContext(req, id, stepId);
    await this.signaturesService.rejectDocument(id, dto.reason, ctx);
    return { ok: true };
  }

  @Get('documents/:id/signatures')
  @UseGuards(ClerkAuthGuard)
  list(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    if (!user.email) throw new BadRequestException('No email on token');
    return this.signaturesService.listSignaturesForDocument(
      id,
      user.clerkId,
      user.email,
    );
  }
}

function buildSignerContext(
  req: Request,
  documentId: string,
  stepId: string,
): SignerContext {
  const r = req as Request & {
    clerkUserId?: string;
    actorEmail?: string | null;
    actorName?: string | null;
    signerEmail?: string;
    isGuest?: boolean;
  };
  const isGuest = r.isGuest === true;
  const signerEmail = isGuest ? (r.signerEmail ?? '') : (r.actorEmail ?? '');
  if (!signerEmail) {
    throw new BadRequestException('No signer email in context');
  }
  return {
    signerId: isGuest ? null : (r.clerkUserId ?? null),
    signerEmail,
    documentId,
    stepId,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    actorName: r.actorName ?? null,
  };
}
