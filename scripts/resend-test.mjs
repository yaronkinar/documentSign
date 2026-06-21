import { readFileSync } from 'node:fs';
import { Resend } from 'resend';

// Load apps/api/.env without extra deps
const env = Object.fromEntries(
  readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const apiKey = env.RESEND_API_KEY;
const from = process.env.TEST_FROM || 'DocFlows <noreply@docflows.uk>';
const to = process.env.TEST_TO || env.BYPASS_AUTH_EMAIL || 'yaronkinar@gmail.com';

if (!apiKey) {
  console.error('No RESEND_API_KEY in apps/api/.env');
  process.exit(1);
}

console.log(`Sending from "${from}" -> "${to}" ...`);
const resend = new Resend(apiKey);
const result = await resend.emails.send({
  from,
  to,
  subject: 'DocFlows Resend domain test',
  html: '<p>If you received this, sending from <strong>docflows.uk</strong> via Resend works. 🎉</p>',
});

if (result.error) {
  console.error('REJECTED:', JSON.stringify(result.error, null, 2));
  process.exit(2);
}
console.log('SENT. id:', result.data?.id);
