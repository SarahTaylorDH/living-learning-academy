# Deploying the LLA website (for Daniel)

## Recommended: GitHub Pages, in the existing repository
The current live site (livinglearningacademy.com) is published from `SarahTaylorDH/living-learning-academy` by GitHub Pages. This project includes a replacement workflow (`.github/workflows/deploy-pages.yml`), so the swap is:

1. The new site is pushed to a branch called **`new-site`**. The live site is unaffected, because only `main` deploys.
2. **Before switching, export any sign-ups collected by the old site.** Its form sent data to `living-learning-academy.daniel4freedom.chatgpt.site/api/interest`, so save that data first.
3. Set up Supabase (step 2 below) and add the repository **variables** (Settings → Secrets and variables → Actions → Variables): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and later `DONATE_URL` and `EMAILS_ENABLED`.
4. When the founders approve, open a pull request from `new-site` into `main` and merge it. GitHub rebuilds, and livinglearningacademy.com shows the new site within a few minutes.
5. **To undo:** revert the merge commit. The old site comes back.

Notes: GitHub Pages ignores `src/_headers` (security headers). If you want them, host on Cloudflare Pages or Netlify instead (below). Everything else works the same.

---

## Alternative: Cloudflare Pages or Netlify

The site is static files built by `node scripts/build.mjs` into `dist/`. Any static host works. Recommended: **Cloudflare Pages** or **Netlify**, both of which have free plans and deploy automatically from GitHub.

> **Do not touch the current live site** until the founders approve the new one. Deploy to the host's free preview address first (for example `lla-website.pages.dev`), review it, and only then point `livinglearningacademy.com` at it.

## 1. Put the code on GitHub
1. Create a repository under LLA's GitHub account, for example `lla-website` (private is fine).
2. Push this folder to it (`git init`, `git add .`, `git commit`, `git push`).

## 2. Set up the database (once)
1. In Supabase, open the LLA project → **SQL Editor** → **New query**.
2. Paste the contents of `supabase/migrations/20261104000000_forms.sql` and click **Run**.
3. Go to **Project Settings → API Keys** (and **Data API** for the URL). Copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **publishable** key (or legacy **anon public** key)
4. **Never** use the *secret* / *service_role* key in the website.

## 3. Connect the host
**Cloudflare Pages:** Workers & Pages → Create → Pages → Connect to Git → choose the repo.
- Build command: `node scripts/build.mjs`
- Build output directory: `dist`
- Environment variables (Production and Preview): `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CONTACT_EMAIL`, `DONATE_URL`, `EMAILS_ENABLED`, and `NODE_VERSION` = `22`.

**Netlify:** Add new site → Import from Git → choose the repo. `netlify.toml` already sets the build command and output folder; add the same environment variables under Site configuration → Environment variables.

Both hosts read `dist/_headers` for security headers (content security policy, no framing and so on).

## 4. Check before going live
- [ ] `npm test` passes.
- [ ] The build log says `Signup form: CONNECTED to Supabase`.
- [ ] Send each form once on the preview address and confirm the rows appear in Supabase → Table Editor → `submissions` (and `submission_children` for the parent form). Delete the test rows afterwards.
- [ ] Optional now, needed soon: confirmation emails (`docs/EMAILS.md`) and the online donation link (`docs/DONATIONS.md`).
- [ ] Check the homepage on a phone and on desktop.
- [ ] The founders have approved the site and the items in `docs/STATUS.md` → "Before launch".

## 5. Point the domain
In the host's dashboard, add the custom domain `livinglearningacademy.com` (and `www`) and follow its DNS instructions at the domain registrar. HTTPS is automatic. Update `SITE_URL` if it differs.

## Updating the site later
Edit files, run `npm test`, commit and push. The host rebuilds and redeploys automatically.
