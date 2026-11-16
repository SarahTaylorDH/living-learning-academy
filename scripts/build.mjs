#!/usr/bin/env node
/**
 * Living Learning Academy: static site builder (no dependencies).
 *
 *   node scripts/build.mjs              -> builds ./dist for production hosting
 *   node scripts/build.mjs --relative   -> builds ./dist with relative links (for file previews)
 *
 * Each page in src/pages/*.html starts with a JSON comment:
 *   <!--{"title":"…","description":"…","path":"/families/"}-->
 * The builder wraps it with the shared <head>, header and footer,
 * writes dist/<path>/index.html, copies assets, and writes config.js,
 * sitemap.xml and robots.txt.
 *
 * Environment variables (see .env.example):
 *   SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, CONTACT_EMAIL
 */
import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const RELATIVE = process.argv.includes('--relative');

// Load .env if present (simple KEY=VALUE lines; real env vars win).
async function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parsePage(raw, file) {
  const m = raw.match(/^\s*<!--(\{[\s\S]*?\})-->\s*/);
  if (!m) throw new Error(`${file}: missing JSON front matter comment`);
  const meta = JSON.parse(m[1]);
  for (const k of ['title', 'description', 'path']) if (!meta[k]) throw new Error(`${file}: front matter needs "${k}"`);
  return { meta, body: raw.slice(m[0].length) };
}

// Rewrite root-absolute links ("/x/") to relative ones for preview builds.
function relativize(html, pagePath) {
  const depth = pagePath.split('/').filter(Boolean).length;
  const prefix = depth ? '../'.repeat(depth) : './';
  return html.replace(/(href|src|srcset|action|data-src-1080|data-src-720)="\/(?!\/)([^"]*)"/g, (all, attr, rest) => {
    if (attr === 'srcset') {
      const v = ('/' + rest).split(',').map(p => p.trim().replace(/^\//, prefix)).join(', ');
      return `${attr}="${v}"`;
    }
    let [pq, hash = ''] = rest.split('#');
    let [p, query = ''] = pq.split('?');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    return `${attr}="${prefix}${p}${query ? '?' + query : ''}${hash ? '#' + hash : ''}"`;
  }).replace(/url\(\/(?!\/)/g, `url(${prefix}`);
}

// <!--#include contact-fields--> inserts src/partials/contact-fields.html (one level deep).
async function includePartials(html) {
  const parts = [...html.matchAll(/<!--#include ([a-z0-9-]+)-->/g)];
  for (const [tag, name] of parts) {
    html = html.replace(tag, await readFile(path.join(SRC, 'partials', `${name}.html`), 'utf8'));
  }
  return html;
}

async function build() {
  await loadEnv();
  const env = {
    SITE_URL: (process.env.SITE_URL || 'https://livinglearningacademy.com').replace(/\/$/, ''),
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    CONTACT_EMAIL: process.env.CONTACT_EMAIL || 'info@livinglearningacademy.com',
    DONATE_URL: process.env.DONATE_URL || '',
    EMAILS_ENABLED: /^(1|true|yes)$/i.test(process.env.EMAILS_ENABLED || ''),
  };

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  for (const f of ['favicon.ico', '_headers']) {
    if (existsSync(path.join(SRC, f))) await cp(path.join(SRC, f), path.join(DIST, f));
  }

  // Public, browser-safe settings only. The anon key is designed to be public;
  // database row-level security (supabase/migrations) limits it to inserts.
  const config = {
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    contactEmail: env.CONTACT_EMAIL,
    donateUrl: /^https:\/\//.test(env.DONATE_URL) ? env.DONATE_URL : '',
    emailsEnabled: env.EMAILS_ENABLED,
  };
  await writeFile(path.join(DIST, 'assets', 'js', 'config.js'), `window.LLA_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

  const header = await readFile(path.join(SRC, 'partials', 'header.html'), 'utf8');
  const footer = await readFile(path.join(SRC, 'partials', 'footer.html'), 'utf8');
  const files = (await readdir(path.join(SRC, 'pages'))).filter(f => f.endsWith('.html')).sort();
  const sitemap = [];

  for (const file of files) {
    const parsed = parsePage(await readFile(path.join(SRC, 'pages', file), 'utf8'), file);
    const meta = parsed.meta;
    const body = await includePartials(parsed.body);
    const fullTitle = meta.path === '/' ? meta.title : `${meta.title} | Living Learning Academy`;
    const canonical = env.SITE_URL + (meta.path === '/404/' ? '/' : meta.path);
    const ogImage = env.SITE_URL + '/assets/img/hero-end.jpg';
    const navMark = (href) => (meta.path === href ? ' aria-current="page"' : '');
    let headerHtml = header.replace(/\{\{current:([^}]+)\}\}/g, (_, href) => navMark(href));

    let html = `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.classList.add('js')</script>
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(meta.description)}">
${meta.noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Living Learning Academy">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#172D50">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/img/icon-512.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/css/site.css">
${meta.preload ? meta.preload.map(p => `<link rel="preload" as="image" href="${p}" fetchpriority="high">`).join('\n') + '\n' : ''}<script src="/assets/js/config.js" defer></script>
<script src="/assets/js/site.js" defer></script>
${(meta.scripts || []).map(s => `<script type="module" src="${s}"></script>`).join('\n')}
</head>
<body class="${esc(meta.bodyClass || '')}">
<a class="skip-link" href="#main">Skip to main content</a>
${headerHtml}
<main id="main">
${body.trim()}
</main>
${footer.replace('{{year}}', String(new Date().getFullYear()))}
</body>
</html>
`;
    if (RELATIVE) html = relativize(html, meta.path === '/404/' ? '/' : meta.path);
    const outDir = meta.path === '/404/' ? DIST : path.join(DIST, meta.path);
    const outFile = meta.path === '/404/' ? path.join(DIST, '404.html') : path.join(outDir, 'index.html');
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, html);
    if (!meta.noindex) sitemap.push(canonical);
  }

  await writeFile(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${env.SITE_URL}/sitemap.xml\n`);

  console.log(`Built ${files.length} pages into dist/${RELATIVE ? ' (relative links)' : ''}`);
  console.log(`Signup form: ${env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? 'CONNECTED to Supabase' : 'NOT CONNECTED (set SUPABASE_URL and SUPABASE_ANON_KEY)'}`);
}

build().catch(err => { console.error(err); process.exit(1); });
