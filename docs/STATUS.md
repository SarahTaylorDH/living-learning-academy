# Project status (Nov 4, 2026, round 3)

## Finished and tested
- **Homepage Sections 1–5** from the approved guides, with live HTML text: Hero, Our Vision, The LLA Network, The LLA Approach, Donate & Get Involved. Revisions applied: sharper hero image, debate photo edited so the listening student sits closer to the speaker, hero "Join the Waitlist" scrolls to *Find Your Place*, updated network card wording, "Teaching & Curriculum" button, and "duty to God" in the Approach section.
- **Header:** logo, navigation (with **Donate**), Get Early Access, mobile menu. **Footer:** "Skills · Leadership · Life" and "Raise Bold Youth Today. For a Stronger Canada Tomorrow."
- **Pages:** About (vision, C.L.I.M.B., CW/CV explained, core values), Courses & Experiences (8 courses, 8 hands-on programs with CW/CV badges), For Parents, For Educators & Mentors, Community & Events, Get Involved, Donate (online button + e-Transfer + not-tax-deductible note), Volunteer, Contact, Privacy (draft), Terms (draft), five forms, Thank you, 404.
- **Five forms** (parent with multiple children incl. gender and weekday availability; mentor with required phone; community waitlist for two private Facebook communities plus event requests; volunteer; course request with phone required for groups), all ending in **Submit**, each tested end to end in a browser against a simulated Supabase. The exact data sent was verified, including two children, the mentor-to-parent prefill, and the thank-you popup.
- **Database** (`supabase/migrations/20261104000000_forms.sql`): tested on PostgreSQL 16 on a fresh database, run twice, and as an upgrade over the earlier version. Inserts for all five forms succeed. Reading, updating, deleting, skipping consent, missing required answers, invalid values, texting consent without a phone, staff-only fields, and adding children to non-parent or old forms are all refused. Staff views were checked.
- **Confirmation emails:** wording for all five forms (`templates.js`, tested) and the sending function (`index.ts`). See "Waiting" below.
- **Page landing:** pages open at the top and #section links (e.g. Request an Event) land on their section after forms finish loading.
- **SEO, performance, accessibility and security headers**, as before. `npm test`: 23 checks.

## Waiting on accounts or credentials
- [ ] **Supabase:** run the migration and add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (DEPLOY.md). Until then the forms show "Preview mode" and save nothing.
- [ ] **Confirmation emails:** Resend account, domain verification, function deploy and webhook (EMAILS.md). The function code has not been run against Resend yet, so test it once these are set up.
- [ ] **e-Transfer Autodeposit:** turn on Interac Autodeposit for **donate@livinglearningacademy.com** in LLA's online banking, so donations go straight into the account with no security question. Added Nov 11, 2026.
- [ ] **Online donations:** Stripe Payment Link → `DONATE_URL` (DONATIONS.md). The e-Transfer option works now.
- [ ] **Hosting** (Cloudflare Pages or Netlify), then the domain switch after approval.

## Content still needed from the founders
- [ ] **CW / CV labels for the 8 courses** (only the hands-on programs were labelled).
- [ ] The Code that mentors and students commit to (About page says "being finalized").
- [ ] Mentor and volunteer screening process (for a Safety & Trust page).
- [ ] Image rights for the garden card photo (unconfirmed per the Section 3 guide). The debate and lighthouse images are AI-generated.
- [ ] Legal review of Privacy and Terms before launch (not legal advice).

## Next phases
- Staff dashboard: login, charts (sign-ups over time, demand by area and interest), click-to-filter, CSV export.
- Course listings and **paid registration before Nov 14**: dates, location, ages, price, capacity, multiple children, waitlists, Stripe checkout, confirmation emails.
- Event listings and "notify me" sending; community application review.
- Distance search by postal code (postal areas are already stored and indexed).
- Hero video: free mock-up first, then Higgsfield (teens on a forest learning adventure).

## Hero video (added Nov 4)
- Home hero plays a 6.5-second clip once and holds the last frame: `assets/video/hero-1080.mp4` (computers) and `hero-720.mp4` (phones), started by `assets/js/site.js`.
- Visitors with "reduce motion" or data saver on, and anyone whose browser can't play it, see the photo `assets/img/hero-end.jpg` instead (no video downloaded).
- The clip was made with AI (Higgsfield / Seedance 2.5) and colour-graded in post. It is not footage of a real LLA event. The bosses should decide whether to add a small "illustrative imagery" line in the footer.
- Words on the hero are live text over the video (never baked in), so they stay sharp and can be edited.
- Replacing the video: keep the same file names and the 2176×1080 shape (the left 640 px is a cream fade so the headline stays readable). Keep the files under ~8 MB each.
