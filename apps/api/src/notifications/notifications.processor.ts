import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Resend } from 'resend';

import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NotificationsService, type SendInviteEmailJob } from './notifications.service';

export type { SendInviteEmailJob } from './notifications.service';

export interface SendRejectionNotifyJob {
  ownerEmail: string;
  documentTitle: string;
  documentId: string;
  signerEmail: string;
  reason: string;
}

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly notificationsService: NotificationsService) {
    super();
    const key = process.env.RESEND_API_KEY;
    this.resend = key ? new Resend(key) : null;
    this.from = process.env.EMAIL_FROM ?? 'noreply@example.com';
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'send-invite':
        return this.notificationsService.sendInviteEmail(
          job.data as SendInviteEmailJob,
        );
      case 'notify-rejection':
        return this.notifyRejection(job as Job<SendRejectionNotifyJob>);
      default:
        // eslint-disable-next-line no-console
        console.warn('[notifications] unknown job name', job.name);
    }
  }

  private async notifyRejection(job: Job<SendRejectionNotifyJob>): Promise<void> {
    if (!this.resend) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    try {
      await this.resend.emails.send({
        from: this.from,
        to: job.data.ownerEmail,
        subject: `Signature rejected: ${job.data.documentTitle}`,
        html: `
          <p>${escapeHtml(job.data.signerEmail)} rejected the document
             <strong>${escapeHtml(job.data.documentTitle)}</strong>.</p>
          <p>Reason: ${escapeHtml(job.data.reason)}</p>
          <p><a href="${appUrl}/documents/${job.data.documentId}">Review</a></p>
        `,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notifications] notify-rejection failed', err);
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
