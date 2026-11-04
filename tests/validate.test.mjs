import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateSubmission, normalizePostal, normalizePhone, INTERESTS, COURSES, PROGRAMS,
  AGE_RANGES, GENDERS, SCHOOLING, FORMATS, WEEKDAYS, COMMUNITIES, HELP_TYPES, AVAILABILITY, ORG_TYPES, PROVINCES,
} from '../src/assets/js/validate.mjs';
import { buildConfirmationEmail } from '../supabase/functions/send-confirmation/templates.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const contact = { full_name: ' Pat  Parent ', email: 'Pat@Example.com', postal_code: 't4n1a1', city: 'Red Deer', province: 'AB', privacy_consent: true };

test('postal codes and phone numbers are normalised', () => {
  assert.equal(normalizePostal('t4n1a1', 'AB'), 'T4N 1A1');
  assert.equal(normalizePostal('D4N 1A1', 'AB'), ''); // D is not a valid first letter
  assert.equal(normalizePostal('90210', 'OUTSIDE'), '90210');
  assert.equal(normalizePhone('(403) 555-1234'), '4035551234');
  assert.equal(normalizePhone('+1 403 555 1234'), '4035551234');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('555'), '');
});

test('parent form: contact, several children and tidy data', () => {
  const { data, children, errors } = validateSubmission('parent', {
    ...contact, phone: '403-555-1234', sms_opt_in: true,
    formats: ['weekdays', 'online'], weekdays: ['mon', 'wed', 'sun'],
    children: [{ age_range: '9-11', gender: 'female', interests: ['public-speaking', 'farming-food', 'bogus'] }, { age_range: '12-14', gender: 'male', interests: [] }],
  });
  assert.deepEqual(errors, {});
  assert.equal(data.form_type, 'parent');
  assert.equal(data.full_name, 'Pat Parent');
  assert.equal(data.email, 'pat@example.com');
  assert.equal(data.postal_code, 'T4N 1A1');
  assert.equal(data.phone, '4035551234');
  assert.equal(data.sms_opt_in, true);
  assert.equal(children.length, 2);
  assert.deepEqual(children[0].interests, ['public-speaking', 'farming-food']);
  assert.equal(children[1].gender, 'male');
  assert.deepEqual(data.weekdays, ['mon', 'wed']);
});

test('parent form needs at least one child with an age group and gender (male or female)', () => {
  assert.ok(validateSubmission('parent', { ...contact, children: [] }).errors.children);
  const e = validateSubmission('parent', { ...contact, children: [{ age_range: '', gender: 'other' }] }).errors;
  assert.ok(e['children.0.age_range']); assert.ok(e['children.0.gender']);
});

test('choosing weekdays requires picking the days', () => {
  const kid = [{ age_range: '6-8', gender: 'male' }];
  assert.ok(validateSubmission('parent', { ...contact, children: kid, formats: ['weekdays'] }).errors.weekdays);
  assert.deepEqual(validateSubmission('parent', { ...contact, children: kid, formats: ['weekdays'], weekdays: ['fri'] }).errors, {});
  assert.deepEqual(validateSubmission('parent', { ...contact, children: kid, formats: ['online'], weekdays: ['fri'] }).data.weekdays, []);
});

test('text consent is ignored without a phone number; privacy consent is required', () => {
  const { data } = validateSubmission('volunteer', { ...contact, sms_opt_in: true, help_types: ['events'] });
  assert.equal(data.sms_opt_in, false);
  assert.ok(validateSubmission('volunteer', { ...contact, privacy_consent: false, help_types: ['events'] }).errors.privacy_consent);
});

test('mentor form needs skills, a reason and a phone; "other" needs a description', () => {
  assert.ok(validateSubmission('mentor', { ...contact }).errors.skills);
  assert.ok(validateSubmission('mentor', { ...contact, skills: ['build-serve'] }).errors.motivation);
  assert.ok(validateSubmission('mentor', { ...contact, skills: ['build-serve'], motivation: 'x' }).errors.phone);
  assert.ok(validateSubmission('mentor', { ...contact, phone: '4035551234', skills: ['other'], motivation: 'I love it' }).errors.skills_other);
  const ok = validateSubmission('mentor', { ...contact, phone: '4035551234', skills: ['build-serve', 'other'], skills_other: 'Welding', motivation: 'I love it', has_children: true });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.data.has_children, true);
});

test('community form: choose a community or request an event; teens need parent permission', () => {
  assert.ok(validateSubmission('community', { ...contact }).errors.communities);
  assert.ok(validateSubmission('community', { ...contact, communities: ['teens'] }).errors.teen_permission);
  assert.deepEqual(validateSubmission('community', { ...contact, communities: ['adults', 'teens'], teen_permission: true }).errors, {});
  assert.deepEqual(validateSubmission('community', { ...contact, event_request: 'Leadership night' }).errors, {});
});

test('volunteer and course request forms check their required answers', () => {
  assert.ok(validateSubmission('volunteer', { ...contact }).errors.help_types);
  const r = validateSubmission('course_request', { ...contact, requested: [], expected_students: '' });
  assert.ok(r.errors.requested); assert.ok(r.errors.expected_students);
  assert.ok(validateSubmission('course_request', { ...contact, requested: ['farming-food'], expected_students: '12', organization_type: 'church' }).errors.phone);
  assert.deepEqual(validateSubmission('course_request', { ...contact, phone: '4035551234', requested: ['farming-food'], expected_students: '12', organization_type: 'church' }).errors, {});
  assert.deepEqual(validateSubmission('course_request', { ...contact, requested: ['farming-food'], expected_students: '3' }).errors, {});
});

test('the database accepts exactly the options the website offers', () => {
  const sql = readFileSync(path.join(ROOT, 'supabase/migrations/20261104000000_forms.sql'), 'utf8');
  const quoted = (txt) => [...txt.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  const rule = (name) => {
    const m = sql.match(new RegExp(`'${name}',\\s*\\$c\\$([\\s\\S]*?)\\$c\\$`));
    assert.ok(m, `no rule ${name}`);
    return quoted(m[1]);
  };
  const keys = (o) => Object.keys(o).sort();
  const interestList = sql.match(/interest_list text := \$l\$([\s\S]*?)\$l\$/);
  assert.deepEqual(quoted(interestList[1]), keys(INTERESTS));
  for (const r of ['skills_allowed', 'interests_allowed', 'requested_allowed', 'child_interests_allowed']) assert.match(sql, new RegExp(`'${r}',\\s+'\\w+ <@ ' \\|\\| interest_list`), r);
  assert.deepEqual(rule('schooling_allowed'), keys(SCHOOLING));
  assert.deepEqual(rule('formats_allowed'), keys(FORMATS));
  assert.deepEqual(rule('weekdays_allowed'), keys(WEEKDAYS));
  assert.deepEqual(rule('communities_allowed'), keys(COMMUNITIES));
  assert.deepEqual(rule('help_types_allowed'), keys(HELP_TYPES));
  assert.deepEqual(rule('availability_allowed'), keys(AVAILABILITY));
  assert.deepEqual(rule('organization_type_allowed'), keys(ORG_TYPES));
  assert.deepEqual(rule('province_allowed'), keys(PROVINCES));
  assert.deepEqual(rule('age_range_allowed'), keys(AGE_RANGES));
  assert.deepEqual(rule('gender_allowed'), keys(GENDERS));
});

test('there is a confirmation email for every form', () => {
  for (const t of ['parent', 'mentor', 'community', 'volunteer', 'course_request']) {
    const e = buildConfirmationEmail({ form_type: t, full_name: 'Pat <b>Parent</b>', city: 'Red Deer' });
    assert.ok(e.subject.length > 5, t);
    assert.match(e.text, /^Hi Pat,/);
    assert.doesNotMatch(e.html, /<b>Parent/, 'names are escaped');
  }
});

test('course and program lists are complete', () => {
  assert.equal(Object.keys(COURSES).length, 8);
  assert.equal(Object.keys(PROGRAMS).length, 8);
  for (const p of Object.values(PROGRAMS)) assert.ok(p.labels.every((l) => ['CW', 'CV'].includes(l)));
});
