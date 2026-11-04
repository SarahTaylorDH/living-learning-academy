// Living Learning Academy: confirmation email wording, one per form.
// Plain JavaScript so both the Supabase Edge Function (Deno) and the tests (Node) can use it.

const SITE = 'https://livinglearningacademy.com';
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const firstName = (full = '') => String(full).trim().split(/\s+/)[0] || 'there';

const COPY = {
  parent: {
    subject: 'You’re on the LLA waitlist',
    lines: [
      'Thank you for joining the Living Learning Academy waitlist.',
      'We’ve saved your children’s age groups and interests, and we’ll use them to plan courses and hands-on programs near {city}. You’ll be among the first to hear when registration opens.',
    ],
  },
  mentor: {
    subject: 'Thank you for your interest in mentoring with LLA',
    lines: [
      'Thank you for offering to pass on your skills to the next generation.',
      'We’ve received your mentor inquiry, and a member of our team will be in touch soon about next steps.',
    ],
  },
  community: {
    subject: 'You’re on the LLA community waitlist',
    lines: [
      'Thank you for joining the waitlist for the LLA community.',
      'Our two private Facebook communities, one for parents, educators and mentors and one for teens 13 and older, open soon. We’ll invite you when they launch, and follow up on any event you requested.',
    ],
  },
  volunteer: {
    subject: 'Thank you for offering to volunteer with LLA',
    lines: [
      'It takes a village, and we’re grateful you want to be part of it.',
      'We’ll be in touch as volunteer opportunities open near {city}.',
    ],
  },
  course_request: {
    subject: 'We’ve received your course request',
    lines: [
      'Thank you for telling us which courses and programs you’d like in your area.',
      'Requests like yours help us decide where LLA grows next. We’ll be in touch as plans take shape near {city}.',
    ],
  },
};

/** Build { subject, html, text } for a new submission row. */
export function buildConfirmationEmail(record) {
  const c = COPY[record.form_type] || COPY.parent;
  const fill = (s) => s.replace('{city}', record.city || 'you');
  const lines = c.lines.map(fill);
  const name = firstName(record.full_name);
  const sign = ['Raise Bold Youth Today. For a Stronger Canada Tomorrow.', 'Living Learning Academy', SITE];
  const footer = 'You’re receiving this because you sent a form at livinglearningacademy.com. Questions? Reply to this email or write to info@livinglearningacademy.com.';

  const text = [`Hi ${name},`, '', ...lines.flatMap((l) => [l, '']), ...sign, '', footer].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:Georgia,serif;color:#2f3542">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <p style="font:700 12px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#a97838;margin:0 0 18px">Living Learning Academy</p>
  <p style="font-size:17px;line-height:1.6;margin:0 0 16px">Hi ${esc(name)},</p>
  ${lines.map((l) => `<p style="font-size:17px;line-height:1.6;margin:0 0 16px">${esc(l)}</p>`).join('\n  ')}
  <p style="font-size:17px;line-height:1.6;margin:24px 0 4px;color:#a97838;font-style:italic">Raise Bold Youth Today.</p>
  <p style="font-size:17px;line-height:1.6;margin:0 0 24px;color:#172d50;font-style:italic">For a Stronger Canada Tomorrow.</p>
  <p style="font-size:15px;margin:0 0 4px;color:#172d50"><strong>Living Learning Academy</strong></p>
  <p style="font-size:15px;margin:0 0 28px"><a href="${SITE}" style="color:#172d50">livinglearningacademy.com</a></p>
  <p style="font:12px/1.5 Arial,sans-serif;color:#6b7080;border-top:1px solid #ddd5c6;padding-top:14px">${esc(footer)}</p>
</div></body></html>`;
  return { subject: c.subject, html, text };
}
