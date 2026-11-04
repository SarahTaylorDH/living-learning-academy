// Living Learning Academy: thank-you page. Tailors the message to the form sent,
// and invites people to donate or volunteer.
const q = new URLSearchParams(location.search);
const type = q.get('type') || 'parent';
const COPY = {
  parent: ['You’re on the waitlist', 'Thank you for joining.', 'We’ll be in touch as courses, hands-on programs and events open near you.'],
  mentor: ['Mentor inquiry received', 'Thank you for offering your skills.', 'We’ll be in touch soon about becoming an LLA mentor.'],
  community: ['You’re on the community waitlist', 'Thank you for joining.', 'We’ll invite you when our private communities open, and follow up on any event you requested.'],
  volunteer: ['Thank you, volunteer', 'Thank you for sharing your time.', 'We’ll be in touch as volunteer opportunities open near you.'],
  course_request: ['Request received', 'Thank you for your request.', 'We’ll use it to plan courses and programs in your area.'],
};
const [eyebrow, title, text] = COPY[type] || COPY.parent;
document.querySelector('[data-thanks="eyebrow"]').textContent = eyebrow;
document.querySelector('[data-thanks="title"]').textContent = title;
document.querySelector('[data-thanks="text"]').textContent = text;
if (q.get('preview') === '1') document.getElementById('preview-notice').hidden = false;
if ((window.LLA_CONFIG || {}).emailsEnabled && q.get('preview') !== '1') document.getElementById('email-note').hidden = false;
if (q.get('kids') === '1') document.getElementById('kids-notice').hidden = false;

// Invite to donate or volunteer (volunteers are only invited to donate).
const dialog = document.getElementById('invite');
if (type === 'volunteer') dialog.querySelector('[data-invite="volunteer"]').remove();
if (dialog && typeof dialog.showModal === 'function') {
  setTimeout(() => { try { dialog.showModal(); } catch {} }, 700);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
