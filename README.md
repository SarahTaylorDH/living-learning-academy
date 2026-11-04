# Living Learning Academy: Website

The replacement website for **livinglearningacademy.com**: homepage Sections 1–5 (as approved in the design guides), the supporting pages, and five secure forms (parents, mentors, community, volunteers, course requests) that save to a Supabase database and send confirmation emails.

- **No dependencies.** Plain HTML, CSS and JavaScript, plus a small Node build script. Nothing to `npm install`.
- **Free to host** on Cloudflare Pages or Netlify, deployed straight from GitHub.
- **Owned by LLA.** Everything needed to run, change and deploy the site is in this repository.

> Status: see [`docs/STATUS.md`](docs/STATUS.md) for what is finished and tested, what is waiting on accounts, and what content is still needed.

---

## Quick start (local preview)

Requires **Node.js 20 or newer**.

```bash
npm run dev          # builds into dist/ and serves it at http://localhost:4321
npm test             # 23 automated checks (pages, links, wording, emails, form rules, database lists)
```

To connect the forms locally, copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Without them the form runs in a clearly labelled **preview mode** and saves nothing.

## How the project is organised

```
src/
  pages/            One file per page. Starts with a JSON comment: title, description, path.
  partials/         header, footer and shared form pieces. Pages include them with <!--#include name-->.
  assets/css/       site.css: all styling (navy #172D50, gold #A97838, ivory #F7F5F0).
  assets/js/        site.js (menu, settings), forms.js (all forms), validate.mjs (form options + rules), thanks.js.
  assets/img/       Optimised images (WebP + JPG) and the logo.
  _headers          Security headers for Netlify / Cloudflare Pages.
scripts/
  build.mjs         Builds src/ into dist/ (adds <head>, header, footer, sitemap, robots.txt, config.js).
  serve.mjs         Local preview server.
supabase/migrations/
  20261104000000_forms.sql     Creates the form tables, staff views and security rules.
supabase/functions/
  send-confirmation/           Sends confirmation emails (templates.js holds the wording).
tests/              Node's built-in test runner (`npm test`).
docs/               Deployment, status and services/costs.
```

### Editing content
- **Change text:** edit the page in `src/pages/`. The homepage is `index.html`, with each approved section marked by a comment.
- **Add a page:** copy an existing page, change the JSON comment at the top (`title`, `description`, `path`), and link to it.
- **Change navigation:** `src/partials/header.html` and `footer.html`.
- **Change courses, programs or form options:** edit `src/assets/js/validate.mjs`, the Courses & Experiences page (`src/pages/programs.html`), and add a Supabase migration updating the matching `check` lists. `npm test` fails until all three agree.
- Approved wording in Sections 1–5 must stay as written. `npm test` checks key phrases.

## Forms and data

| Form | Page | Saves |
| --- | --- | --- |
| Parents (waitlist) | `/join/` | contact + each child's age group, gender (male/female) and interests, schooling, formats (weekdays → which days), open answers |
| Mentors | `/join/mentor/` | contact (**phone required**) + skills (courses, programs, other), why they want to teach, "I have children too" |
| Community | `/join/community/` | contact + waitlist for the two private Facebook communities (adults; teens 13+ with parent permission), topics, event request |
| Volunteers | `/volunteer/` | contact + how they'd help, availability, experience |
| Course requests | `/join/request-course/` | contact (phone required for groups) + courses wanted, expected students, group type and name |

Every form collects name, email, **postal code**, city, province, a **cell phone** (optional unless noted) with a separate text-message consent, separate unticked email consents, and Privacy Policy consent. After sending, people see a tailored thank-you page with an invitation to donate or volunteer, and (once set up) a confirmation email.

**Security model:** the website uses Supabase's public *publishable/anon* key. Row-level security allows that key to **insert only**. It cannot read, update or delete any row, children can only be added to a parent form sent in the last 15 minutes, and the database enforces every allowed value. All of this was tested against PostgreSQL 16 (see `docs/STATUS.md`). Spam protection is a hidden honeypot field plus a minimum fill time.

**Staff viewing data (today):** Supabase dashboard → *Table Editor*, or *SQL Editor* with:
- `select * from submissions_overview;`: every form, newest first, children summarised
- `select * from people;`: one row per email, so a mentor who also signed up their children appears once with both forms
- `select * from interest_demand;`: interests and course requests by postal area, for planning

All can be exported to CSV. A staff dashboard with charts and filters is the next phase.

## Deploying

See **[`docs/DEPLOY.md`](docs/DEPLOY.md)**. In short: connect this GitHub repo to Cloudflare Pages or Netlify, use build command `node scripts/build.mjs` and output folder `dist`, and add the environment variables from `.env.example`.

## Services and costs

See **[`docs/SERVICES.md`](docs/SERVICES.md)**, plus **[`docs/EMAILS.md`](docs/EMAILS.md)** (confirmation emails) and **[`docs/DONATIONS.md`](docs/DONATIONS.md)** (online donations).
