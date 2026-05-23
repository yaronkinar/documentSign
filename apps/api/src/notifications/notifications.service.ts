import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Resend } from 'resend';

import { NOTIFICATIONS_QUEUE } from './notifications.constants';

export interface SendInviteEmailJob {
  to: string;
  signerName: string;
  documentTitle: string;
  documentId: string;
  token: string;
}

@Injectable()
export class NotificationsService {
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {
    const key = process.env.RESEND_API_KEY;
    this.resend = key ? new Resend(key) : null;
    this.from = process.env.EMAIL_FROM ?? 'noreply@example.com';
  }

  async sendInviteEmail(job: SendInviteEmailJob): Promise<void> {
    if (!this.resend) {
      // eslint-disable-next-line no-console
      console.warn('[notifications] RESEND_API_KEY not set - skipping email', {
        to: job.to,
      });
      return;
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const link = `${appUrl}/sign/${job.documentId}?token=${job.token}`;

    await this.resend.emails.send({
      from: this.from,
      to: job.to,
      subject: `Please sign: ${job.documentTitle}`,
      html: `
        <p>Hi ${escapeHtml(job.signerName)},</p>
        <p>You have been invited to sign the document
           <strong>${escapeHtml(job.documentTitle)}</strong>.</p>
        <p><a href="${link}">Open and sign</a></p>
        <p>This link expires in 72 hours.</p>
      `,
    });
  }

  /** Queue invite email; fall back to sending inline when Redis is unavailable. */
  async enqueueInviteEmail(job: SendInviteEmailJob): Promise<void> {
    try {
      await this.queue.add('send-invite', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[notifications] queue unavailable, sending invite inline',
        err,
      );
      try {
        await this.sendInviteEmail(job);
      } catch (sendErr) {
        // eslint-disable-next-line no-console
        console.error('[notifications] inline send-invite failed', sendErr);
        throw sendErr;
      }
    }
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
