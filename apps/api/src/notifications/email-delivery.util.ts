/**
 * Resend sandbox (onboarding@resend.dev) only delivers to the account owner email.
 * In dev, redirect all outbound mail to one inbox while preserving the intended recipient
 * in the subject/body so Gmail +alias signer flows can be tested without a verified domain.
 */
export function resolveEmailDelivery(intendedTo: string): {
  to: string;
  subjectPrefix: string;
  devBannerHtml: string;
} {
  const normalized = intendedTo.trim().toLowerCase();
  const redirect = resolveDevEmailRedirect();
  if (!redirect || normalized === redirect) {
    return { to: intendedTo, subjectPrefix: '', devBannerHtml: '' };
  }

  return {
    to: redirect,
    subjectPrefix: `[→ ${intendedTo}] `,
    devBannerHtml: `<p style="background:#fef3c7;padding:8px 12px;font-size:12px;color:#92400e;">
         Dev email redirect — intended recipient:
         <strong>${escapeHtml(intendedTo)}</strong>
       </p>`,
  };
}

function resolveDevEmailRedirect(): string | null {
  const explicit = process.env.DEV_EMAIL_REDIRECT?.trim().toLowerCase();
  if (explicit) return explicit || null;

  const usingResendSandbox = (process.env.EMAIL_FROM ?? '').includes('resend.dev');
  if (process.env.BYPASS_AUTH === 'true' && usingResendSandbox) {
    const bypassEmail = process.env.BYPASS_AUTH_EMAIL?.trim().toLowerCase();
    return bypassEmail || null;
  }

  return null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
