// Living Learning Academy: one engine for every signup form.
// Each form is <form class="lla-form" data-form-type="parent|mentor|community|volunteer|course_request">.
// Saves to Supabase's REST API with the public publishable/anon key. Database
// row-level security allows INSERT only (see supabase/migrations).
import { OPTION_LISTS, validateSubmission } from './validate.mjs';

const cfg = window.LLA_CONFIG || {};
const CONNECTED = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const CONTACT = cfg.contactEmail || 'info@livinglearningacademy.com';
const CONTACT_FIELDS = ['full_name', 'email', 'phone', 'postal_code', 'city', 'province'];
const startedAt = Date.now();

// ---------------------------------------------------------------- rendering
function renderOptions(root) {
  root.querySelectorAll('[data-options]').forEach((el) => {
    const list = OPTION_LISTS[el.dataset.options];
    if (!list) return;
    if (el.tagName === 'SELECT') {
      for (const [value, label] of Object.entries(list)) el.add(new Option(label, value));
      return;
    }
    const type = el.dataset.type || 'checkbox';
    const name = el.dataset.name;
    el.innerHTML = Object.entries(list).map(([value, label]) =>
      `<label class="choice"><input type="${type}" name="${name}" value="${value}"> <span>${label}</span></label>`).join('');
  });
}

function setupChildren(form) {
  const list = form.querySelector('[data-children]');
  if (!list) return;
  const tpl = form.querySelector('#child-template');
  const addBtn = form.querySelector('[data-add-child]');
  let count = 0;
  const renumber = () => {
    list.querySelectorAll('.child').forEach((c, i) => {
      c.querySelector('.child__title').textContent = `Child ${i + 1}`;
      c.querySelectorAll('input').forEach((inp) => { inp.name = inp.name.replace(/^children\.\d+\./, `children.${i}.`); });
      c.querySelectorAll('[data-error-for]').forEach((e) => { e.dataset.errorFor = e.dataset.errorFor.replace(/^children\.\d+\./, `children.${i}.`); });
      c.querySelector('[data-remove-child]').hidden = list.children.length === 1;
    });
    addBtn.hidden = list.children.length >= 10;
  };
  const add = () => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelectorAll('[data-name]').forEach((el) => { el.dataset.name = el.dataset.name.replace('__i__', String(count)); });
    node.querySelectorAll('[data-error-for]').forEach((el) => { el.dataset.errorFor = el.dataset.errorFor.replace('__i__', String(count)); });
    renderOptions(node);
    count += 1;
    node.querySelector('[data-remove-child]').addEventListener('click', () => { node.remove(); renumber(); });
    list.appendChild(node);
    renumber();
    return node;
  };
  addBtn.addEventListener('click', () => { const n = add(); n.querySelector('input').focus(); });
  add();
}

// Show a text box only when a related option is ticked: <div data-show-when="skills=other">
function setupConditional(form) {
  const update = () => form.querySelectorAll('[data-show-when]').forEach((el) => {
    const [name, value] = el.dataset.showWhen.split('=');
    el.hidden = ![...form.querySelectorAll(`[name="${name}"]`)].some((i) => i.checked && i.value === value);
  });
  form.addEventListener('change', update);
  update();
}

// Phone is required for mentors, and for course requests made on behalf of a group.
function setupPhone(form, type) {
  const star = form.querySelector('[data-phone-req]');
  const input = form.elements.phone;
  if (!input) return;
  const update = () => {
    const needed = type === 'mentor' || (type === 'course_request' && Boolean(form.elements.organization_type?.value));
    if (star) star.hidden = !needed;
    input.required = needed;
  };
  form.addEventListener('change', update);
  update();
}

// ---------------------------------------------------------------- reading values
function readValues(form) {
  const v = {};
  const groups = {};
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.name === 'website') return;
    if (el.type === 'checkbox') {
      const isGroup = form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(el.name)}"]`).length > 1 || el.value !== 'on';
      if (isGroup) { (groups[el.name] ||= []); if (el.checked) groups[el.name].push(el.value); }
      else v[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) v[el.name] = el.value; else if (!(el.name in v)) v[el.name] = '';
    } else v[el.name] = el.value;
  });
  Object.assign(v, groups);
  // children.N.age_range / children.N.interests -> children: [{...}]
  const kids = [];
  for (const [k, val] of Object.entries(v)) {
    const m = k.match(/^children\.(\d+)\.(\w+)$/);
    if (m) { (kids[m[1]] ||= { interests: [] })[m[2]] = val; delete v[k]; }
  }
  if (form.querySelector('[data-children]')) v.children = kids.filter(Boolean);
  return v;
}

// ---------------------------------------------------------------- errors & status
function setStatus(form, kind, html) {
  const box = form.querySelector('[data-status]');
  box.innerHTML = html ? `<div class="form-status form-status--${kind}">${html}</div>` : '';
}

function showErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; el.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [field, msg] of Object.entries(errors)) {
    const err = form.querySelector(`[data-error-for="${field}"]`);
    if (err) { err.textContent = msg; err.hidden = false; }
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`) || err?.closest('fieldset, .field')?.querySelector('input, select, textarea');
    if (input) { input.setAttribute('aria-invalid', 'true'); first ||= input; }
  }
  if (first) first.focus();
  if (Object.keys(errors).length) setStatus(form, 'error', 'Please check the highlighted fields.');
}

// ---------------------------------------------------------------- saving
async function insert(table, rows) {
  const key = cfg.supabaseAnonKey;
  const res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      // Legacy "anon" keys are JWTs and also go in Authorization; new "publishable" keys use apikey only.
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Remember contact details for this browser tab, so a mentor who also signs up
// their children doesn't retype them. Stored only in sessionStorage (cleared when the tab closes).
function rememberContact(data) {
  try { sessionStorage.setItem('lla_contact', JSON.stringify(Object.fromEntries(CONTACT_FIELDS.map((f) => [f, data[f] || ''])))); } catch {}
}
function prefillContact(form) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('lla_contact') || 'null');
    if (!saved) return;
    for (const f of CONTACT_FIELDS) { const el = form.elements[f]; if (el && !el.value && saved[f]) el.value = saved[f]; }
  } catch {}
}

function thanksUrl(form, type, extra = {}) {
  const base = document.getElementById('thanks-link').getAttribute('href');
  const q = new URLSearchParams({ type, ...extra });
  if (!CONNECTED) q.set('preview', '1');
  return `${base}?${q}`;
}

// ---------------------------------------------------------------- wiring
function initForm(form) {
  const type = form.dataset.formType;
  renderOptions(form);
  setupChildren(form);
  setupConditional(form);
  setupPhone(form, type);
  prefillContact(form);
  if (!CONNECTED) {
    setStatus(form, 'info', '<strong>Preview mode:</strong> this form is not connected to the database yet, so nothing you enter is saved. ' +
      `To reach us today, email <a href="mailto:${CONTACT}">${CONTACT}</a>.`);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readValues(form);
    const { data, children, errors } = validateSubmission(type, values);
    showErrors(form, errors);
    if (Object.keys(errors).length) return;

    const extra = type === 'mentor' && data.has_children ? { kids: '1' } : {};
    // Bots: filled the hidden field or submitted inhumanly fast. Pretend success.
    if (form.elements.website?.value || Date.now() - startedAt < 2500) { location.href = thanksUrl(form, type, extra); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    try {
      const id = uuid();
      if (CONNECTED) {
        await insert('submissions', [{ id, ...data, source: location.pathname.slice(0, 40) }]);
        if (children.length) {
          try { await insert('submission_children', children.map((c) => ({ submission_id: id, ...c }))); }
          catch { /* main details are saved; staff can follow up on children */ }
        }
      }
      rememberContact(data);
      location.href = thanksUrl(form, type, extra);
    } catch (err) {
      setStatus(form, 'error', `Sorry, we couldn’t save your details just now. Please try again, or email <a href="mailto:${CONTACT}">${CONTACT}</a>.`);
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  });
}

document.querySelectorAll('form.lla-form').forEach(initForm);
