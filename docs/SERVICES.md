# Third-party services, costs and credentials

| Service | Used for | Cost | Who holds the login |
| --- | --- | --- | --- |
| GitHub | Stores the code | Free | LLA (company account) |
| Cloudflare Pages *or* Netlify | Hosts the website, builds from GitHub | Free plan is enough to start | LLA |
| Supabase | Database for sign-ups (later: courses, registrations, staff login) | Free to start. **Upgrade to Pro (US$25/month) before paid registration opens**: the free plan pauses after 1 week without activity and has no daily backups. | LLA (company email) |
| Domain registrar | livinglearningacademy.com | Existing | LLA |

**Coming next (not set up yet):**
| Service | Used for | Cost |
| --- | --- | --- |
| Stripe | Online donations now (Payment Link, see DONATIONS.md); course registration payments next. Card details never touch our site. | No monthly fee; a per-payment fee |
| Resend | Automatic confirmation emails from info@livinglearningacademy.com (see EMAILS.md); event notices later | Free tier to start |
| Cloudflare Turnstile (optional) | Stronger spam protection on forms | Free |

**Settings the website needs** (all public-safe, set as environment variables):
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_ANON_KEY`: Supabase **publishable** (anon) key
- `DONATE_URL`: Stripe Payment Link (optional)
- `EMAILS_ENABLED`: `true` once confirmation emails are set up
- `CONTACT_EMAIL`: info@livinglearningacademy.com

**Credentials that must stay private** (never in the code, never in chat): the Supabase database password and secret/service_role key, Stripe secret keys, the Resend API key and the webhook secret (these two live only in Supabase secrets).
