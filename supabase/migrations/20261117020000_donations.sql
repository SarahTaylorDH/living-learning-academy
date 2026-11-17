-- Donations: staff add a row (Table Editor -> donations) when a gift arrives,
-- and the donor gets a thank-you email automatically (through send_email / Resend).
-- Private: no website access. Later, card donations can be added automatically from Square.

create table if not exists public.donations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  donor_name        text not null check (char_length(donor_name) between 1 and 120),
  email             text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  amount            numeric(10, 2) not null check (amount > 0),
  method            text not null default 'etransfer' check (method in ('etransfer', 'card', 'cash', 'cheque', 'other')),
  notes             text,
  thank_you_sent_at timestamptz   -- set automatically when the thank-you email goes out
);
alter table public.donations enable row level security;
revoke all on public.donations from anon, authenticated;

-- True once the Resend API key is in the Vault (so emails can actually go out).
create or replace function public.lla_email_ready()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'resend_api_key');
$$;
revoke all on function public.lla_email_ready() from public, anon, authenticated;

create or replace function public.donations_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_name text := split_part(trim(new.donor_name), ' ', 1);
begin
  if not lla_email_ready() then return new; end if;
  perform send_email(
    array[new.email],
    'Thank you for preparing the next generation',
    lla_email_wrap(
      '<p>Hi ' || lla_html(first_name) || ',</p>'
      || '<p>I wanted to thank you personally for your generous gift of <strong>' || to_char(new.amount, 'FM$999,999,990.00') || '</strong> to Living Learning Academy.</p>'
      || '<p>At LLA, children and youth gain more than lessons. They build the confidence, character and real-world skills to lead with courage and stand firm in what''s true.</p>'
      || '<p>Your generosity helps make that real. It brings hands-on courses, trusted mentors and new learning experiences to the next generation, and I''m truly honoured that you believe in this work with us.</p>'
      || '<p><strong>Together, we''re helping raise bolder youth today for a stronger Canada tomorrow.</strong></p>'
      || '<p style="margin:22px 0;padding:12px 16px;border-left:3px solid #b8924a;color:#1d2a44;font-style:italic">“Train up a child in the way he should go: and when he is old, he will not depart from it.”<br><span style="font-style:normal;font-size:13px;color:#6b7280">Proverbs 22:6</span></p>'
      || '<p>Blessings and courage,</p>'
      || '<p><strong>Drea Humphrey</strong><br>Founder, Living Learning Academy</p>'
      || '<p style="font-size:12px;color:#6b7280">Donations to Living Learning Academy are not tax-deductible, and we can''t issue tax receipts.</p>'));
  update public.donations set thank_you_sent_at = now() where id = new.id;
  return new;
exception when others then
  raise warning 'donation thank-you failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists donations_after_insert on public.donations;
create trigger donations_after_insert after insert on public.donations
  for each row execute function public.donations_after_insert();
