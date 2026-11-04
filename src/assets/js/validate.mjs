// Living Learning Academy: form options and validation rules.
// ONE source of truth, shared by the browser forms (forms.js) and the tests.
// The database enforces the same allowed values (supabase/migrations), so if you
// add or rename an option here, add a migration that updates the matching check lists.

export const CONSENT_VERSION = '2026-11-04';

export const FORM_TYPES = ['parent', 'mentor', 'community', 'volunteer', 'course_request'];

export const PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon', OUTSIDE: 'Outside Canada',
};

export const AGE_RANGES = { '6-8': 'Ages 6–8', '9-11': 'Ages 9–11', '12-14': 'Ages 12–14', '15-18': 'Ages 15–18' };

export const SCHOOLING = { public: 'Public school', homeschool: 'Homeschool', private: 'Private or faith-based school', alternative: 'Alternative school or co-op' };

export const FORMATS = { 'in-person': 'In person', online: 'Online', 'hands-on': 'Hands-on programs and day camps', weekdays: 'Weekdays', weekend: 'Weekends' };
export const WEEKDAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
export const GENDERS = { male: 'Male', female: 'Female' };

// Courses and Hands-On Programs, exactly as listed on the Courses & Experiences page.
export const COURSES = {
  'critical-thinking-debate': { name: 'Critical Thinking & Debate', desc: 'Recognize truth, examine evidence and defend ideas respectfully.' },
  'finance-entrepreneurship': { name: 'Finance & Entrepreneurship', desc: 'Manage money wisely and turn ideas into opportunities.' },
  'public-speaking': { name: 'Public Speaking & Influence', desc: 'Speak clearly, communicate courageously and influence with integrity.' },
  'impact-community': { name: 'Impact & Community', desc: 'Put compassion and leadership into action through service.' },
  'faith-freedom': { name: 'Faith & Freedom', desc: 'Understand and defend the Christian faith, grow in God’s will and explore freedom in Christ and the freedoms that come from Him.' },
  'culture-identity': { name: 'Culture & Identity', desc: 'Explore identity and culture through conservative principles, traditional values and a Christian worldview.' },
  'civics-citizenship': { name: 'Civics & Citizenship', desc: 'Understand government, rights and your role in Canada’s future.' },
  'creative-arts-media': { name: 'Creative Arts & Media', desc: 'Develop creative talents and tell stories that shape culture.' },
};

export const PROGRAMS = {
  'survival-nature': { name: 'Survival & Nature', labels: ['CW'], desc: 'Build outdoor skills, resilience and resourcefulness in nature.' },
  'farming-food': { name: 'Farming & Food', labels: ['CW', 'CV'], desc: 'Learn to prepare and grow food, care for animals and steward the land.' },
  'build-serve': { name: 'Build & Serve', labels: ['CW', 'CV'], desc: 'Use tools, build, make repairs and put practical skills to work for others.' },
  'self-defence': { name: 'Self-Defence & Character', labels: ['CW'], desc: 'Develop personal safety skills, sound judgment and self-control.' },
  'music-dance': { name: 'Music, Dance & Character', labels: ['CW'], desc: 'Build creative skills, discipline and teamwork through music and movement.' },
  'beauty-character': { name: 'Beauty & Character', labels: ['CW'], desc: 'Explore hair, makeup and personal care grounded in dignity, self-respect and biblical beauty.' },
  'etiquette-character': { name: 'Etiquette & Character', labels: ['CW'], desc: 'Practise good manners, build social confidence and learn to understand and appreciate biological differences.' },
  'fitness-character': { name: 'Fitness & Character', labels: ['CW', 'CV'], desc: 'Build strength, healthy habits, good character and perseverance through exercise.' },
};

const names = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.name]));
export const COURSE_OPTIONS = names(COURSES);
export const PROGRAM_OPTIONS = names(PROGRAMS);
/** Every course and program, plus "Something else". Used for interests, mentor skills and course requests. */
export const INTERESTS = { ...COURSE_OPTIONS, ...PROGRAM_OPTIONS, other: 'Something else' };

export const COMMUNITIES = {
  adults: 'The LLA community for parents, educators and mentors',
  teens: 'The LLA teen community (for my teen, aged 13 or older)',
};
export const HELP_TYPES = { events: 'Helping out at events', mentors: 'Assisting mentors during courses and programs', other: 'Something else' };
export const AVAILABILITY = { weekdays: 'Weekdays', evenings: 'Evenings', weekends: 'Weekends', occasional: 'Occasional events only' };
export const ORG_TYPES = { 'family-group': 'A group of families', church: 'Church', school: 'School', 'homeschool-co-op': 'Homeschool co-op', other: 'Other' };

/** Option lists the HTML forms can render by name: <div data-options="AGE_RANGES">. */
export const OPTION_LISTS = { PROVINCES, AGE_RANGES, GENDERS, SCHOOLING, FORMATS, WEEKDAYS, INTERESTS, COURSE_OPTIONS, PROGRAM_OPTIONS, COMMUNITIES, HELP_TYPES, AVAILABILITY, ORG_TYPES };

// ------------------------------------------------------------------ helpers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CA_POSTAL_RE = /^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)$/i;
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const cleanLong = (v) => (typeof v === 'string' ? v.trim() : '');
const pick = (vals, allowed) => [...new Set((Array.isArray(vals) ? vals : []).filter((v) => v in allowed))];
const yes = (v) => v === true;

/** Canadian postal codes become "A1A 1A1"; returns '' when invalid. */
export function normalizePostal(value, province) {
  const v = clean(value).toUpperCase();
  if (province === 'OUTSIDE') return /^[A-Z0-9 -]{2,10}$/.test(v) ? v : '';
  const m = v.match(CA_POSTAL_RE);
  return m ? `${m[1]} ${m[2]}` : '';
}

/** Phone numbers become digits like "4035551234" (or "+1…" kept as 11 digits). Returns null when empty, '' when invalid. */
export function normalizePhone(value) {
  const raw = clean(value);
  if (!raw) return null;
  let d = raw.replace(/[^\d]/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

function longText(data, errors, field, value, { required = false, min = 0, label = 'This field' } = {}) {
  data[field] = cleanLong(value);
  if (required && data[field].length < Math.max(min, 1)) errors[field] = `${label} is required.`;
  else if (data[field].length > 2000) errors[field] = 'Please keep this under 2,000 characters.';
}

// ------------------------------------------------------------------ contact block (every form)
export function validateContact(input) {
  const errors = {};
  const province = clean(input.province);
  const phone = normalizePhone(input.phone);
  const data = {
    full_name: clean(input.full_name),
    email: clean(input.email).toLowerCase(),
    phone: phone || null,
    sms_opt_in: Boolean(phone) && yes(input.sms_opt_in),
    postal_code: normalizePostal(input.postal_code, province),
    city: clean(input.city),
    province,
    notify_events: yes(input.notify_events),
    updates_opt_in: yes(input.updates_opt_in),
    privacy_consent: yes(input.privacy_consent),
    consent_version: CONSENT_VERSION,
  };
  if (data.full_name.length < 2) errors.full_name = 'Please enter your name.';
  else if (data.full_name.length > 120) errors.full_name = 'Please keep your name under 120 characters.';
  if (!EMAIL_RE.test(data.email) || data.email.length > 254) errors.email = 'Please enter a valid email address.';
  if (phone === '') errors.phone = 'Please enter a 10-digit phone number, or leave this blank.';
  if (!(province in PROVINCES)) errors.province = 'Please choose your province or territory.';
  if (!data.postal_code) errors.postal_code = province === 'OUTSIDE' ? 'Please enter your postal or ZIP code.' : 'Please enter a valid postal code, like A1A 1A1.';
  if (data.city.length < 2) errors.city = 'Please enter your city or town.';
  else if (data.city.length > 120) errors.city = 'Please keep this under 120 characters.';
  if (!data.privacy_consent) errors.privacy_consent = 'Please tick this box so we can save your details.';
  return { data, errors };
}

// ------------------------------------------------------------------ each form
/**
 * Validates a whole form. Returns { data, children, errors }.
 * `data` is one row for the `submissions` table; `children` (parent form only) are rows for `submission_children`.
 */
export function validateSubmission(formType, input) {
  if (!FORM_TYPES.includes(formType)) throw new Error(`Unknown form type: ${formType}`);
  const { data, errors } = validateContact(input);
  data.form_type = formType;
  let children = [];

  if (formType === 'parent') {
    const kids = Array.isArray(input.children) ? input.children.slice(0, 10) : [];
    children = kids.map((c) => ({ age_range: clean(c.age_range), gender: clean(c.gender), interests: pick(c.interests, INTERESTS) }));
    if (!children.length) errors.children = 'Please add at least one child.';
    children.forEach((c, i) => {
      if (!(c.age_range in AGE_RANGES)) errors[`children.${i}.age_range`] = 'Please choose this child’s age group.';
      if (!(c.gender in GENDERS)) errors[`children.${i}.gender`] = 'Please choose male or female.';
    });
    data.schooling = pick(input.schooling, SCHOOLING);
    data.formats = pick(input.formats, FORMATS);
    data.weekdays = data.formats.includes('weekdays') ? pick(input.weekdays, WEEKDAYS) : [];
    if (data.formats.includes('weekdays') && !data.weekdays.length) errors.weekdays = 'Please choose which weekdays work for you.';
    longText(data, errors, 'learn_wish', input.learn_wish);
    longText(data, errors, 'values_gap', input.values_gap);
  }

  if (formType === 'mentor') {
    data.skills = pick(input.skills, INTERESTS);
    data.skills_other = clean(input.skills_other);
    if (!data.skills.length) errors.skills = 'Please choose at least one skill you could teach.';
    if (data.skills.includes('other') && data.skills_other.length < 2) errors.skills_other = 'Please tell us your other skill.';
    if (data.skills_other.length > 200) errors.skills_other = 'Please keep this under 200 characters.';
    longText(data, errors, 'motivation', input.motivation, { required: true, label: 'Telling us why you’d like to help' });
    data.has_children = yes(input.has_children);
    if (!data.phone && !errors.phone) errors.phone = 'Please enter a phone number so we can reach you.';
  }

  if (formType === 'community') {
    data.communities = pick(input.communities, COMMUNITIES);
    data.teen_permission = data.communities.includes('teens') && yes(input.teen_permission);
    data.interests = pick(input.interests, INTERESTS);
    longText(data, errors, 'event_request', input.event_request);
    if (data.communities.includes('teens') && !data.teen_permission) errors.teen_permission = 'Please confirm your teen is 13 or older and has your permission to join.';
    if (!data.communities.length && !data.event_request) errors.communities = 'Please choose a community, or tell us about an event you’d like.';
  }

  if (formType === 'volunteer') {
    data.help_types = pick(input.help_types, HELP_TYPES);
    if (!data.help_types.length) errors.help_types = 'Please choose at least one way you’d like to help.';
    data.availability = pick(input.availability, AVAILABILITY);
    longText(data, errors, 'about_you', input.about_you);
  }

  if (formType === 'course_request') {
    data.requested = pick(input.requested, INTERESTS);
    data.requested_other = clean(input.requested_other);
    if (!data.requested.length) errors.requested = 'Please choose at least one course or program.';
    if (data.requested.includes('other') && data.requested_other.length < 2) errors.requested_other = 'Please tell us what else you’d like.';
    if (data.requested_other.length > 200) errors.requested_other = 'Please keep this under 200 characters.';
    const n = input.expected_students === '' || input.expected_students == null ? NaN : Number(input.expected_students);
    data.expected_students = Number.isInteger(n) ? n : null;
    if (!Number.isInteger(n) || n < 1 || n > 1000) errors.expected_students = 'Please enter a number from 1 to 1,000.';
    data.organization_type = clean(input.organization_type) || null;
    if (data.organization_type && !(data.organization_type in ORG_TYPES)) errors.organization_type = 'Please choose an option.';
    if (data.organization_type && !data.phone && !errors.phone) errors.phone = 'Please enter a phone number so we can reach your group.';
    data.organization_name = clean(input.organization_name) || null;
    if (data.organization_name && data.organization_name.length > 120) errors.organization_name = 'Please keep this under 120 characters.';
    longText(data, errors, 'message', input.message);
  }

  return { data, children, errors };
}
