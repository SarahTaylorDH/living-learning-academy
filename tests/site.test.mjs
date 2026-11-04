// Builds the site, then checks every page: title, one <h1>, image alt text, and that internal links resolve.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pages = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && pages.push(p); });

before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'pipe' });
  walk(DIST);
});

test('every page has a title, a description and exactly one h1', () => {
  assert.ok(pages.length >= 18);
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    assert.match(html, /<title>[^<]{5,}<\/title>/, p);
    assert.match(html, /<meta name="description" content="[^"]{20,}"/, p);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p} should have one h1`);
  }
});

test('every image has alt text (empty alt only for decorative images)', () => {
  for (const p of pages) {
    for (const img of readFileSync(p, 'utf8').match(/<img\b[^>]*>/g) || []) assert.match(img, /\balt="/, `${p}: ${img}`);
  }
});

test('every internal link and asset exists', () => {
  const missing = [];
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = path.join(DIST, url);
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(path.join(target, 'index.html')));
      if (!ok) missing.push(`${path.relative(DIST, p)} -> ${url}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('in-page anchors used by the homepage buttons exist', () => {
  const home = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  for (const id of ['our-vision', 'lla-network']) assert.match(home, new RegExp(`id="${id}"`));
  const about = readFileSync(path.join(DIST, 'about/index.html'), 'utf8');
  for (const id of ['climb', 'core-values']) assert.match(about, new RegExp(`id="${id}"`));
});

test('approved homepage wording is present verbatim', () => {
  const text = readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  for (const phrase of [
    'Find Your Place.', 'Help Raise the Next Generation.', 'We’re bringing that village back.',
    'Leave the academics to the schools.', 'We’ll take care of the rest.', 'Raise Bold Youth Today.',
    'a sense of duty to God, family, community and country.', 'Teaching & Curriculum',
    'For a Stronger Canada Tomorrow.', 'Teach & Bring LLA to Your Students', 'Find Your People. Make an Impact.',
  ]) assert.ok(text.includes(phrase.replace('&', '&amp;')) || text.includes(phrase), `missing: ${phrase}`);
});

test('the secret Supabase key is never written into the site', () => {
  const cfg = readFileSync(path.join(DIST, 'assets/js/config.js'), 'utf8');
  assert.doesNotMatch(cfg, /service_role|sb_secret_/);
});

test('only the approved email addresses appear on the site', () => {
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    for (const [addr] of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) {
      assert.ok(['info@livinglearningacademy.com', 'donate@livinglearningacademy.com'].includes(addr.toLowerCase()), `${path.relative(DIST, p)}: ${addr}`);
    }
  }
});

test('retired wording is gone', () => {
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    assert.doesNotMatch(html, /Mini-School/i, p);
    assert.doesNotMatch(html, /Volunteer Instead/i, p);
    assert.doesNotMatch(html, /Partner or supporter/i, p);
  }
});

test('the Courses & Experiences page lists every course and program the forms offer', async () => {
  const { COURSES, PROGRAMS } = await import('../src/assets/js/validate.mjs');
  const html = readFileSync(path.join(DIST, 'programs/index.html'), 'utf8').replace(/&amp;/g, '&');
  for (const item of [...Object.values(COURSES), ...Object.values(PROGRAMS)]) {
    assert.ok(html.includes(item.name), `missing ${item.name}`);
    assert.ok(html.includes(item.desc), `missing description for ${item.name}`);
  }
});

test('header shows Donate, and the hero waitlist button scrolls to Find Your Place', () => {
  const home = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(home, /<a href="\/donate\/"[^>]*>Donate<\/a>/);
  assert.match(home, /href="#lla-network">Join the Waitlist/);
});

test('every form page posts to a known form type and has a thank-you link', () => {
  const forms = { 'join/index.html': 'parent', 'join/mentor/index.html': 'mentor', 'join/community/index.html': 'community', 'volunteer/index.html': 'volunteer', 'join/request-course/index.html': 'course_request' };
  for (const [file, type] of Object.entries(forms)) {
    const html = readFileSync(path.join(DIST, file), 'utf8');
    assert.match(html, new RegExp(`data-form-type="${type}"`), file);
    assert.match(html, /id="thanks-link"/, file);
    assert.match(html, /name="postal_code"/, file);
    assert.match(html, /name="phone"/, file);
    assert.doesNotMatch(html, /<!--#include/, `${file} has an unresolved include`);
  }
});

test('footer slogan says Stronger, and every form button says Submit', () => {
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    assert.doesNotMatch(html, /Brighter Canada/i, p);
    for (const [btn] of html.matchAll(/<button class="btn[^"]*" type="submit">[^<]*/g)) assert.match(btn, /Submit/, p);
  }
  assert.match(readFileSync(path.join(DIST, 'index.html'), 'utf8'), /site-footer__line">Raise Bold Youth Today\. For a Stronger Canada Tomorrow\./);
});

test('home hero uses the video with photo fallbacks, and every hero file exists', () => {
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /<video class="hero__video"[^>]*muted[^>]*playsinline/);
  assert.doesNotMatch(html, /<video[^>]*\sloop/);          // plays once, holds the last frame
  assert.doesNotMatch(html, /<video[^>]*\sautoplay/);      // started by script, so reduced-motion / data-saver visitors get the photo
  for (const f of ['video/hero-1080.mp4', 'video/hero-720.mp4', 'img/hero-start.jpg', 'img/hero-start.webp', 'img/hero-end.jpg', 'img/hero-end.webp']) {
    assert.ok(existsSync(path.join(DIST, 'assets', f)), f);
  }
  assert.match(html, /class="hero__still hero__still--end"[^>]*alt="[^"]{20,}"/);   // the visible photo has real alt text
  assert.ok(statSync(path.join(DIST, 'assets/video/hero-1080.mp4')).size < 8 * 1024 * 1024); // small enough for GitHub and fast to load
});

test('preview (--relative) build also rewrites the hero video addresses', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--relative'], { stdio: 'pipe' });
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /data-src-1080="\.\/assets\/video\/hero-1080\.mp4"/);
  assert.match(html, /data-src-720="\.\/assets\/video\/hero-720\.mp4"/);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'pipe' });   // restore the normal build
});
