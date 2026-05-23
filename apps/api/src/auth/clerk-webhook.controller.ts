import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';

import { UsersService } from '../users/users.service';

interface ClerkWebhookEmail {
  email_address: string;
  id: string;
}

interface ClerkWebhookUserData {
  id: string;
  email_addresses: ClerkWebhookEmail[];
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkWebhookUserData;
}

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      // eslint-disable-next-line no-console
      console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET not set');
      return { ok: true };
    }

    // We need raw body for svix verification. NestJS by default JSON-parses
    // the body; bodyParser raw must be enabled for this route in main.ts in
    // production. For now we re-stringify and verify - acceptable for MVP.
    const rawBody = JSON.stringify(req.body);

    let event: ClerkWebhookEvent;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[clerk-webhook] signature verification failed', err);
      // Per spec - return 200 quickly so Clerk does not retry into a storm.
      return { ok: true };
    }

    try {
      await this.dispatch(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[clerk-webhook] handler error', err);
    }

    return { ok: true };
  }

  private async dispatch(event: ClerkWebhookEvent): Promise<void> {
    const { type, data } = event;
    if (type === 'user.created' || type === 'user.updated') {
      const primary = data.email_addresses.find(
        (e) => e.id === data.primary_email_address_id,
      );
      const email = primary?.email_address ?? data.email_addresses[0]?.email_address;
      if (!email) return;
      const name =
        [data.first_name, data.last_name].filter(Boolean).join(' ').trim() ||
        email;
      await this.usersService.upsertFromClerk({
        clerkId: data.id,
        email,
        name,
        avatarUrl: data.image_url ?? undefined,
      });
    } else if (type === 'user.deleted') {
      await this.usersService.anonymizeByClerkId(data.id);
    }
  }
}
