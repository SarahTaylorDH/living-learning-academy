// Parent & student survey. Validates with validateSurvey (validate.mjs), then saves one row to survey_responses
// through Supabase's REST API with the public key. The thank-you shows only after the row is really saved.
import { OPTION_LISTS, validateSurvey } from './validate.mjs';

const cfg = window.LLA_CONFIG || {};
const CONNECTED = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const CONTACT = cfg.contactEmail || 'info@livinglearningacademy.com';
const form = document.getElementById('survey-form');
const startedAt = Date.now();

// Fill in the option lists.
form.querySelectorAll('[data-options]').forEach((el) => {
  const list = OPTION_LISTS[el.dataset.options];
  if (!list) return;
  if (el.tagName === 'SELECT') { for (const [v, l] of Object.entries(list)) el.add(new Option(l, v)); return; }
  const type = el.dataset.type || 'checkbox';
  el.innerHTML = Object.entries(list).map(([v, l]) => `<label class="choice"><input type="${type}" name="${el.dataset.name}" value="${v}"> <span>${l}</span></label>`).join('');
});

// Show the "a parent knows" box only for students.
function syncConditional() {
  const respondent = form.querySelector('input[name="respondent"]:checked')?.value;
  form.querySelectorAll('[data-show-when]').forEach((el) => { el.hidden = el.dataset.showWhen !== `respondent=${respondent}`; });
}
form.addEventListener('change', syncConditional);

function status(kind, html) {
  const wrap = form.querySelector('[data-status]');
  wrap.innerHTML = html ? `<div class="form-status form-status--${kind}">${html}</div>` : '';
}

function read() {
  const v = {};
  for (const el of form.elements) {
    if (!el.name || el.name === 'website') continue;
    if (el.type === 'checkbox' && form.querySelectorAll(`[name="${el.name}"]`).length > 1) (v[el.name] ||= []).push(...(el.checked ? [el.value] : []));
    else if (el.type === 'checkbox') v[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; }
    else v[el.name] = el.value;
  }
  return v;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function save(row) {
  const key = cfg.supabaseAnonKey;
  const res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/survey_responses`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([row]),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

function showThanks() {
  form.hidden = true;
  document.getElementById('survey-thanks').hidden = false;
  document.getElementById('survey-thanks').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (!CONNECTED) {
  status('info', `<strong>Preview mode:</strong> this survey is not connected to the database yet, so nothing you enter is saved. To reach us today, email <a href="mailto:${CONTACT}">${CONTACT}</a>.`);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { data, errors } = validateSurvey(read());
  form.querySelectorAll('.error').forEach((p) => { p.hidden = true; });
  let first;
  for (const [field, msg] of Object.entries(errors)) {
    const p = form.querySelector(`[data-error-for="${field}"]`);
    if (p) { p.textContent = msg; p.hidden = false; first ||= p; }
  }
  if (first) { status('error', 'Please check the highlighted questions.'); first.scrollIntoView({ block: 'center' }); return; }
  status('', '');
  if (form.elements.website.value || Date.now() - startedAt < 2500) { showThanks(); return; } // bots: pretend, save nothing
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    if (CONNECTED) await save({ id: uuid(), ...data, source: location.pathname.slice(0, 40) });
    showThanks();
  } catch {
    status('error', `Sorry, we couldn’t save your answers just now. Please try again, or email <a href="mailto:${CONTACT}">${CONTACT}</a>.`);
    btn.disabled = false; btn.removeAttribute('aria-busy');
  }
});
