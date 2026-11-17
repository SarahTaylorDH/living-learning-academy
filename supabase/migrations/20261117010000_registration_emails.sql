-- Registration emails, sent from the database through Resend (https://resend.com).
--   * Parent: a confirmation for every registration (course, child, how to pay).
--   * Staff (payments@ + Ariyah): every new registration, every released unpaid spot,
--     and "time to cancel" for monthly card plans (a daily check, one month after registering).
-- Needs the Resend API key in Supabase Vault under the name 'resend_api_key'.
-- Until that key exists, nothing is sent (send_email quietly does nothing).

create extension if not exists pg_net with schema extensions;

alter table public.registrations
  add column if not exists cancel_reminder_sent_at timestamptz,
  add column if not exists etransfer_from text check (char_length(etransfer_from) <= 200);  -- email the e-Transfer will come from
alter table public.registrations
  add column if not exists location text check (char_length(location) <= 120),   -- course location, e.g. 'Langley, BC'
  add column if not exists schedule text check (char_length(schedule) <= 160);   -- e.g. 'Fridays 9–11 am, January 15 to March 5, 2027 (8 weeks)'

create or replace function public.lla_html(p text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Send one email through Resend. Does nothing if the API key isn't in the Vault yet.
create or replace function public.send_email(p_to text[], p_subject text, p_html text, p_reply_to text default 'info@livinglearningacademy.com')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if k is null or p_to is null or array_length(p_to, 1) is null then return; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Living Learning Academy <info@livinglearningacademy.com>',
      'to', to_jsonb(p_to),
      'reply_to', p_reply_to,
      'subject', p_subject,
      'html', p_html)
  );
exception when others then
  raise warning 'send_email failed: %', sqlerrm;  -- never block a registration because of email
end $$;
revoke all on function public.send_email(text[], text, text, text) from public, anon, authenticated;

create or replace function public.lla_staff_emails()
returns text[] language sql immutable as $$
  select array['payments@livinglearningacademy.com', 'ariyahtaylorlla@gmail.com'];
$$;

-- Square card checkout link for a course, plan and family discount (see src/assets/js/register.js).
create or replace function public.lla_card_link(p_course text, p_plan text, p_family boolean)
returns text language sql immutable as $$
  select 'https://square.link/u/' || case
    when p_plan = 'full' then case p_course
      when 'music-theatre' then 'nx9H0MFs' when 'truth-hunters' then 'RANVnzzY'
      when 'intro-entrepreneurship' then 'RT0t6VCb' when 'kidpreneurs' then 'z00M2wyk'
      when 'critical-thinking-debate' then 'bpqriTpN' end
    when p_family then case p_course
      when 'music-theatre' then 'rk5CTeNi' when 'truth-hunters' then 'ZdARaRdo'
      when 'intro-entrepreneurship' then 'BKIKO96S' when 'kidpreneurs' then 'Nc7BWd9U'
      when 'critical-thinking-debate' then 'HV4NcTVO' end
    else case p_course
      when 'music-theatre' then 'LS2KqbG8' when 'truth-hunters' then 'RJX7WEQp'
      when 'intro-entrepreneurship' then 'rMOd9RMt' when 'kidpreneurs' then 'NZF2B4X5'
      when 'critical-thinking-debate' then 'ynruDCrI' end
  end;
$$;

-- A plain description of what this family owes and how.
create or replace function public.lla_payment_text(r public.registrations)
returns text language sql stable as $$
  select case
    when r.payment_choice = 'etransfer' then
      'Interac e-Transfer, paid in full: ' || case when r.family_discount then '$250.20 (10% family discount)' else '$278' end
    when r.payment_plan = 'monthly' then
      'Card, monthly: ' || case when r.family_discount then '$125.10' else '$139' end || ' today and again in one month'
    else
      'Card, paid in full: $278' || case when r.family_discount then ' (with code LLAFAMILY10: $250.20)' else '' end
  end;
$$;

create or replace function public.lla_email_wrap(p_body text)
returns text language sql immutable as $$
  select '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2a44;max-width:560px">'
    || p_body
    || '<p style="margin-top:28px;color:#6b7280;font-size:13px">Living Learning Academy<br>livinglearningacademy.com</p></div>';
$$;

-- After each registration: confirmation to the parent, alert to staff.
create or replace function public.registrations_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_name text := split_part(trim(new.parent_name), ' ', 1);
  pay text;
  staff text;
  sched text := coalesce(new.schedule, case when new.term = 'winter-2027' then 'Fridays, January 15 to March 5, 2027 (8 weeks)' end);
  loc text := coalesce(new.location, case when new.term = 'winter-2027' then 'Langley, BC' end);
begin
  if new.payment_choice = 'etransfer' then
    pay := '<p><strong>How to pay:</strong> send an Interac e-Transfer</p>'
      || '<table style="border-collapse:collapse">'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Amount</td><td><strong>'
      || case when new.family_discount then '$250.20</strong> (10% family discount)' else '$278</strong>' end || '</td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">To</td><td><strong>payments@livinglearningacademy.com</strong></td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Message</td><td><strong>' || lla_html(new.payment_reference) || '</strong></td></tr></table>'
      || '<p>We''ll watch for your e-Transfer from <strong>' || lla_html(coalesce(new.etransfer_from, new.email)) || '</strong>. Your spot is held for 12 hours while we wait for payment.</p>';
  else
    pay := '<p><strong>How to pay:</strong> '
      || case when new.payment_plan = 'monthly'
           then 'by card, ' || case when new.family_discount then '$125.10' else '$139' end || ' a month for 2 months, charged today and again in one month.'
           else 'by card, one payment of $278.' end || '</p>'
      || case when new.family_discount and new.payment_plan = 'full'
           then '<p>Your 10% family discount code: <strong>LLAFAMILY10</strong>. Enter it under "Add coupon" at checkout.</p>' else '' end
      || '<p>If you didn''t finish checkout, you can pay here: <a href="' || lla_card_link(new.course_id, new.payment_plan, new.family_discount) || '">Square secure checkout</a>.</p>';
  end if;

  -- Parent email only for e-Transfer: card families go straight to Square, and get the thank-you once paid.
  if new.payment_choice = 'etransfer' and new.order_id is null then
  perform send_email(
    array[new.email],
    'You''re registered: ' || new.child_first_name || ' in ' || new.course_name,
    lla_email_wrap(
      '<p>Hi ' || lla_html(first_name) || ',</p>'
      || '<p>Thank you for registering <strong>' || lla_html(new.child_first_name) || '</strong> for <strong>' || lla_html(new.course_name) || '</strong>. We''re so excited!</p>'
      || '<p>' || coalesce('<strong>When:</strong> ' || lla_html(sched), '') || case when sched is not null and loc is not null then '<br>' else '' end || coalesce('<strong>Where:</strong> ' || lla_html(loc) || ' (exact address sent once your e-Transfer arrives)', '') || '</p>'
      || pay
      || '<p>Once your e-Transfer arrives, we''ll email a thank-you with the address and everything you need for the first class. Our mentors look forward to helping ' || lla_html(new.child_first_name) || ' build confidence, character and real-world skills!</p>'
      || '<p><strong>Registering another child?</strong> Each additional course in your household is 10% off this term.</p>'
      || '<p>Questions? Just reply to this email.</p>'));
  end if;

  staff := '<table style="border-collapse:collapse">'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Course</td><td>' || lla_html(new.course_name) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">When / where</td><td>' || lla_html(coalesce(sched, '(not set)') || ' · ' || coalesce(loc, '(not set)')) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Child</td><td>' || lla_html(new.child_first_name || ' ' || new.child_last_name) || ', age ' || new.child_age || ', ' || new.child_gender || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Parent</td><td>' || lla_html(new.parent_name) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Email</td><td>' || lla_html(new.email) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Phone</td><td>' || lla_html(new.phone) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Address</td><td>' || lla_html(new.street_address || ', ' || new.city || ', ' || new.province || ' ' || new.postal_code) || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Payment</td><td>' || lla_html(lla_payment_text(new)) || '</td></tr>'
    || case when new.payment_choice = 'etransfer' then
         '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">e-Transfer from</td><td>' || lla_html(coalesce(new.etransfer_from, new.email)) || '</td></tr>'
      || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">e-Transfer message</td><td>' || lla_html(new.payment_reference) || '</td></tr>' else '' end
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Family discount</td><td>' || case when new.family_discount then 'Yes (10%)' else 'No' end || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Referred by</td><td>' || coalesce(nullif(lla_html(new.referred_by), ''), '(none)') || '</td></tr>'
    || '<tr><td style="padding:3px 14px 3px 0;color:#6b7280">Spot held until</td><td>' || to_char(new.hold_expires_at at time zone 'America/Vancouver', 'Mon DD, YYYY HH12:MI am') || ' (Pacific)</td></tr>'
    || '</table>';
  perform send_email(
    lla_staff_emails(),
    'New registration: ' || new.child_first_name || ' ' || new.child_last_name || ', ' || new.course_name,
    lla_email_wrap('<p><strong>New registration.</strong> When the money arrives, mark it paid in Supabase.</p>' || staff),
    new.email);
  return new;
exception when others then
  raise warning 'registration emails failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists registrations_after_insert on public.registrations;
create trigger registrations_after_insert after insert on public.registrations
  for each row execute function public.registrations_after_insert();

-- When an unpaid hold runs out (released_at is set), alert staff.
create or replace function public.registrations_after_release()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform send_email(
    lla_staff_emails(),
    'Spot released (unpaid): ' || new.child_first_name || ' ' || new.child_last_name || ', ' || new.course_name,
    lla_email_wrap('<p><strong>An unpaid registration''s hold ran out</strong>, so the spot is open again.</p>'
      || '<p>' || lla_html(new.parent_name) || ' · ' || lla_html(new.email) || ' · ' || lla_html(new.phone) || '<br>'
      || 'Chose: ' || lla_html(lla_payment_text(new)) || '</p>'
      || '<p>If they did pay, mark the registration paid in Supabase and clear released_at.</p>'),
    new.email);
  return new;
exception when others then
  raise warning 'release email failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists registrations_after_release on public.registrations;
create trigger registrations_after_release after update of released_at on public.registrations
  for each row when (old.released_at is null and new.released_at is not null)
  execute function public.registrations_after_release();

-- Daily: monthly card plans whose 2nd charge was due -> "time to cancel" alert (once per registration).
create or replace function public.send_cancel_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare r public.registrations;
begin
  for r in
    select * from public.registrations
    where payment_choice = 'square' and payment_plan = 'monthly' and not cancelled and released_at is null
      and cancel_reminder_sent_at is null and order_id is null and created_at + interval '1 month' <= now()
    order by created_at
  loop
    perform send_email(
      lla_staff_emails(),
      'Time to cancel a monthly plan: ' || r.child_first_name || ' ' || r.child_last_name || ', ' || r.course_name,
      lla_email_wrap('<p><strong>This family''s 2nd monthly charge was due ' || to_char((r.created_at + interval '1 month') at time zone 'America/Vancouver', 'Mon DD') || '.</strong></p>'
        || '<p>' || lla_html(r.parent_name) || ' · ' || lla_html(r.email) || ' · ' || lla_html(r.phone) || '<br>'
        || 'Plan: ' || lla_html(lla_payment_text(r)) || '</p>'
        || '<ol><li>In Square, check that the 2nd charge went through.</li>'
        || '<li>If it did, <strong>cancel the subscription</strong> so they are not charged a 3rd time.</li>'
        || '<li>If it failed, contact the family about payment.</li></ol>'),
      r.email);
    update public.registrations set cancel_reminder_sent_at = now() where id = r.id;
  end loop;
end $$;
revoke all on function public.send_cancel_reminders() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lla-cancel-reminders';
select cron.schedule('lla-cancel-reminders', '0 17 * * *', 'select public.send_cancel_reminders();');  -- 9 or 10 am Pacific
