# Automatic confirmation emails (about 20 minutes, one time)

When someone sends any form, they get a short confirmation email from **info@livinglearningacademy.com**. The wording for each form is in `supabase/functions/send-confirmation/templates.js`.

How it works: Supabase saves the form → a **Database Webhook** calls the **Edge Function** `send-confirmation` → it sends the email through **Resend** (an email-sending service with a free tier).

## 1. Resend
1. Create an account at https://resend.com with a company email.
2. **Domains → Add domain** → `livinglearningacademy.com`. Add the DNS records it shows at your domain registrar and wait until it says *Verified*. This lets emails come from info@livinglearningacademy.com without landing in spam.
3. **API Keys → Create API key** (sending access). Keep it private.

## 2. Deploy the Edge Function (Supabase CLI)
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set RESEND_API_KEY=<resend key> WEBHOOK_SECRET=<any long random string>
npx supabase functions deploy send-confirmation --no-verify-jwt
```
(`--no-verify-jwt` is correct here: the function checks the `x-webhook-secret` header instead.)

## 3. Create the Database Webhook
Supabase dashboard → **Database → Webhooks → Create a new hook**
- Table: `public.submissions` · Events: **Insert**
- Type: **Supabase Edge Functions** → `send-confirmation` (or HTTP request to the function URL), method POST
- HTTP header: `x-webhook-secret` = the same random string as above

## 4. Turn on the website message
In the hosting dashboard, set the environment variable `EMAILS_ENABLED=true` and redeploy. The thank-you page will then say "A confirmation email is on its way."

## Test
Send a form with your own email. Check **Edge Functions → send-confirmation → Logs** if nothing arrives.
