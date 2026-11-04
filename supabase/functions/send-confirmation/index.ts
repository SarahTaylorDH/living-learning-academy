// Supabase Edge Function: sends a confirmation email when a website form is saved.
// Triggered by a Database Webhook on INSERT into public.submissions (see docs/EMAILS.md).
// Secrets (set with `supabase secrets set`): RESEND_API_KEY, WEBHOOK_SECRET, EMAIL_FROM (optional).
import { buildConfirmationEmail } from './templates.js';

const FROM = Deno.env.get('EMAIL_FROM') ?? 'Living Learning Academy <info@livinglearningacademy.com>';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const record = payload?.record;
  if (payload?.type !== 'INSERT' || payload?.table !== 'submissions' || !record?.email) {
    return new Response('Ignored', { status: 200 });
  }

  const { subject, html, text } = buildConfirmationEmail(record);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [record.email], reply_to: 'info@livinglearningacademy.com', subject, html, text }),
  });
  if (!res.ok) {
    console.error('Email failed', res.status, await res.text());
    return new Response('Email failed', { status: 502 });
  }
  return new Response('Sent', { status: 200 });
});
