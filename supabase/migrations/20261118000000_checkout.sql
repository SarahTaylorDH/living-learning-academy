-- Checkout: a family's cart becomes ONE order (one or more courses; later books, gift cards...).
--   * Card: the Edge Function "checkout" builds a Square checkout for the whole order.
--     Monthly = a Square subscription that stops by itself after 2 payments.
--     Square tells us when it's paid (Edge Function "square-webhook" -> square_event()).
--   * e-Transfer: one instructions email right away; staff mark the order paid when money arrives.
-- Emails to the family:
--   card:       nothing at checkout; ONE reminder if they leave without paying; thank-you once paid.
--   e-Transfer: instructions right away; thank-you once paid.
-- Staff can mark paid either way: orders.status = 'paid', or tick paid on every registration in the order.

-- ---------------------------------------------------------------- courses: price, place, schedule
alter table public.course_capacity
  add column if not exists ref_name      text,                         -- short name for e-Transfer messages
  add column if not exists price_cents   int  not null default 27800,  -- pay in full
  add column if not exists monthly_cents int  not null default 13900,  -- per month
  add column if not exists months        int  not null default 2,
  add column if not exists place         text,                         -- e.g. 'Langley, BC' (see public.locations)
  add column if not exists schedule      text,                         -- e.g. 'Fridays 9–11 am, January 15 to March 5, 2027 (8 weeks)'
  add column if not exists staff_only    boolean not null default false;

update public.course_capacity set course_name = 'LLA Music Theatre & Character', ref_name = 'Music Theatre', place = 'Langley, BC',
  schedule = 'Fridays 9–11 am, January 15 to March 5, 2027 (8 weeks)' where course_id = 'music-theatre';
update public.course_capacity set course_name = 'LLA Jr. Truth Detectives', ref_name = 'Truth Detectives', place = 'Langley, BC',
  schedule = 'Fridays 12–2 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'truth-hunters';
update public.course_capacity set course_name = 'LLA Intro to Entrepreneurship', ref_name = 'Entrepreneurship', place = 'Langley, BC',
  schedule = 'Fridays 12–2 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'intro-entrepreneurship';
update public.course_capacity set course_name = 'LLA Kidpreneurs', ref_name = 'Kidpreneurs', place = 'Langley, BC',
  schedule = 'Fridays 3–5 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'kidpreneurs';
update public.course_capacity set course_name = 'LLA Spot the Spin', ref_name = 'Spot the Spin', place = 'Langley, BC',
  schedule = 'Fridays 3:30–5:30 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'critical-thinking-debate';
-- $1 course for staff testing only (only a staff email can order it; not shown on the site).
insert into public.course_capacity (course_id, course_name, capacity, ref_name, price_cents, monthly_cents, months, place, schedule, staff_only)
values ('test-course', 'LLA Test Course', 100, 'Test', 100, 100, 2, 'Langley, BC', 'Test only', true)
on conflict (course_id) do update set staff_only = true, price_cents = 100, monthly_cents = 100;

-- Address for each place, sent in the paid thank-you. Fill in address (and notes) in Table Editor.
create table if not exists public.locations (
  place   text primary key,
  address text,     -- full street address
  notes   text      -- parking, entrance, what to bring...
);
insert into public.locations (place) values ('Langley, BC') on conflict do nothing;
alter table public.locations enable row level security;
revoke all on public.locations from anon, authenticated;

-- ---------------------------------------------------------------- orders
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  term                   text not null default 'winter-2027',
  parent_name            text not null,
  email                  text not null,
  phone                  text not null,
  method                 text not null check (method in ('card', 'etransfer')),
  plan                   text not null check (plan in ('full', 'monthly')),
  items                  jsonb not null default '[]',   -- what was bought (snapshot for emails)
  total_cents            int not null default 0,        -- pay in full total
  monthly_cents          int,                           -- per month, monthly plans only
  months                 int not null default 2,
  status                 text not null default 'pending' check (status in ('pending', 'paid', 'released', 'replaced', 'cancelled')),
  paid_at                timestamptz,
  payments_received      int not null default 0,
  etransfer_from         text,
  etransfer_message      text,
  referred_by            text,
  source                 text,
  checkout_url           text,
  square_payment_link_id text,
  square_order_id        text,
  square_plan_variation  text,
  square_subscription_id text,
  square_payment_ids     text[] not null default '{}',
  reminder_sent_at       timestamptz,
  thank_you_sent_at      timestamptz,
  staff_notes            text
);
create index if not exists orders_square_order_idx on public.orders (square_order_id);
create index if not exists orders_square_sub_idx on public.orders (square_subscription_id);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

alter table public.registrations add column if not exists order_id uuid references public.orders (id) on delete set null;
create index if not exists registrations_order_idx on public.registrations (order_id);

-- Every Square notification, for checking what happened.
create table if not exists public.square_events (
  event_id    text primary key,
  received_at timestamptz not null default now(),
  type        text,
  result      text,
  payload     jsonb
);
alter table public.square_events enable row level security;
revoke all on public.square_events from anon, authenticated;

-- Square monthly plans, one per monthly amount (created by the checkout function as needed).
create table if not exists public.square_plans (
  amount_cents int not null,
  months       int not null,
  variation_id text not null,
  created_at   timestamptz not null default now(),
  primary key (amount_cents, months)
);
alter table public.square_plans enable row level security;
revoke all on public.square_plans from anon, authenticated;

-- ---------------------------------------------------------------- small helpers
create or replace function public.lla_money(c int)
returns text language sql immutable as $$
  select case when c % 100 = 0 then '$' || to_char(c / 100, 'FM999,999') else to_char(c / 100.0, 'FM$999,999,990.00') end;
$$;

-- 'Sam', 'Sam and Eli', 'Sam, Eli and Ava'
create or replace function public.lla_join(p text[])
returns text language sql immutable as $$
  select case coalesce(array_length(p, 1), 0)
    when 0 then '' when 1 then p[1]
    else array_to_string(p[1:array_length(p, 1) - 1], ', ') || ' and ' || p[array_length(p, 1)] end;
$$;

create or replace function public.lla_order_children(o public.orders)
returns text[] language sql stable as $$
  select coalesce(array_agg(distinct x->>'child'), '{}') from jsonb_array_elements(o.items) x;
$$;

-- One box per course in the order. p_address: also show the street address (thank-you only).
create or replace function public.lla_order_items_html(o public.orders, p_address boolean)
returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(
    '<div style="border:1px solid #eee7da;border-radius:8px;padding:12px 14px;margin:10px 0">'
    || '<strong>' || lla_html(x->>'name') || '</strong> · ' || lla_html(x->>'child')
    || coalesce('<br><span style="color:#6b7280">When:</span> ' || lla_html(x->>'schedule'), '')
    || coalesce('<br><span style="color:#6b7280">Where:</span> ' || case
         when p_address and l.address is not null then lla_html(l.address) || coalesce('<br><span style="color:#6b7280">' || lla_html(l.notes) || '</span>', '')
         when p_address then lla_html(x->>'place') || ' (we''ll email the exact address before the first class)'
         else lla_html(x->>'place') end, '')
    || '</div>', '' order by ord), '')
  from jsonb_array_elements(o.items) with ordinality as t(x, ord)
  left join public.locations l on l.place = x->>'place';
$$;

-- Plain payment summary (staff alerts, release alerts).
create or replace function public.lla_payment_text(r public.registrations)
returns text language sql stable set search_path = public as $$
  select case
    when o.id is not null then
      case o.method when 'etransfer' then 'Interac e-Transfer, ' else 'Card, ' end
      || case when o.plan = 'monthly' then lla_money(o.monthly_cents) || ' a month for ' || o.months || ' months'
              else 'paid in full: ' || lla_money(o.total_cents) end
      || case when jsonb_array_length(o.items) > 1 then ' (order of ' || jsonb_array_length(o.items) || ' courses)' else '' end
      || case when r.family_discount then ', 10% family discount on this course' else '' end
    when r.payment_choice = 'etransfer' then
      'Interac e-Transfer, paid in full: ' || case when r.family_discount then '$250.20 (10% family discount)' else '$278' end
    when r.payment_plan = 'monthly' then
      'Card, monthly: ' || case when r.family_discount then '$125.10' else '$139' end || ' today and again in one month'
    else
      'Card, paid in full: $278' || case when r.family_discount then ' (with code LLAFAMILY10: $250.20)' else '' end
  end
  from (select 1) one left join public.orders o on o.id = r.order_id;
$$;

-- ---------------------------------------------------------------- create an order (called by the checkout function)
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f        jsonb := p->'family';
  meth     text := p->>'method';
  pl       text := coalesce(p->>'plan', 'full');
  oid      uuid := gen_random_uuid();
  it       jsonb;
  c        public.course_capacity;
  reg      public.registrations;
  v_items  jsonb := '[]';
  v_total  int := 0;
  per_mo   int := 0;
  mos      int := 2;
  msgs     text[] := '{}';
  msg      text;
  amt      int;
  mamt     int;
  is_staff boolean;
  hkey     text;
begin
  if meth is null or meth not in ('card', 'etransfer') then raise exception 'bad_method'; end if;
  if pl not in ('full', 'monthly') then raise exception 'bad_plan'; end if;
  if pl = 'monthly' and meth <> 'card' then raise exception 'monthly_is_card_only'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 8 then raise exception 'bad_items'; end if;
  if coalesce((p->>'policy_ack')::boolean, false) is not true then raise exception 'policy_ack_required'; end if;
  if f is null or coalesce(f->>'email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad_email'; end if;
  is_staff := lower(f->>'email') = any (select lower(x) from unnest(lla_staff_emails()) x);
  hkey := household_key(f->>'email', f->>'phone');

  -- Starting over? An earlier unpaid card checkout from this household is replaced (its spots free up).
  update public.registrations set cancelled = true
   where order_id in (select id from public.orders where status = 'pending' and method = 'card' and household_key(email, phone) = hkey);
  update public.orders set status = 'replaced'
   where status = 'pending' and method = 'card' and household_key(email, phone) = hkey;

  insert into public.orders (id, parent_name, email, phone, method, plan, etransfer_from, referred_by, source)
  values (oid, left(f->>'parent_name', 120), left(f->>'email', 200), left(f->>'phone', 40), meth, pl,
          case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
          nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40));

  for it in select value from jsonb_array_elements(p->'items') loop
    select * into c from public.course_capacity where course_id = it->>'course_id';
    if not found or (c.staff_only and not is_staff) then raise exception 'unknown_course'; end if;
    begin
      insert into public.registrations (course_id, course_name, parent_name, email, phone, street_address, city, province, postal_code,
        child_first_name, child_last_name, child_age, child_gender, payment_choice, payment_plan, policy_ack,
        etransfer_from, referred_by, source, order_id, location, schedule)
      values (c.course_id, c.course_name, left(f->>'parent_name', 120), left(f->>'email', 200), left(f->>'phone', 40),
        left(f->>'street_address', 200), left(f->>'city', 100), left(f->>'province', 60),
        upper(regexp_replace(regexp_replace(coalesce(f->>'postal_code', ''), '[ -]', '', 'g'), '^(...)(...)$', '\1 \2')),
        left(trim(it->>'child_first_name'), 80), left(trim(it->>'child_last_name'), 80), (it->>'child_age')::int, it->>'child_gender',
        case when meth = 'etransfer' then 'etransfer' else 'square' end, pl, true,
        case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
        nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40), oid, c.place, c.schedule)
      returning * into reg;
    exception when raise_exception then
      if sqlerrm = 'course_full' then raise exception 'course_full:%', c.course_id; end if;
      raise;
    end;
    -- Family discount: decided by the database (first course in a new household pays full price).
    amt  := case when reg.family_discount then round(c.price_cents * 0.9)::int else c.price_cents end;
    mamt := case when reg.family_discount then round(c.monthly_cents * 0.9)::int else c.monthly_cents end;
    v_total := v_total + amt; per_mo := per_mo + mamt; mos := c.months;
    msgs := msgs || (coalesce(c.ref_name, c.course_name) || ' ' || reg.child_first_name);
    v_items := v_items || jsonb_build_object('registration_id', reg.id, 'course_id', c.course_id, 'name', c.course_name,
      'ref', c.ref_name, 'child', reg.child_first_name, 'child_last', reg.child_last_name,
      'amount_cents', amt, 'monthly_cents', mamt, 'family_discount', reg.family_discount,
      'place', c.place, 'schedule', c.schedule, 'kind', 'course');
  end loop;

  msg := left(array_to_string(msgs, ', '), 120);
  update public.orders set items = v_items, total_cents = v_total,
      monthly_cents = case when pl = 'monthly' then per_mo end, months = mos, etransfer_message = msg
    where id = oid;
  update public.registrations set payment_reference = msg where order_id = oid;

  if meth = 'etransfer' then perform lla_send_order_instructions(oid); end if;

  return jsonb_build_object('order_id', oid, 'method', meth, 'plan', pl, 'total_cents', v_total,
    'monthly_cents', per_mo, 'months', mos, 'items', v_items, 'etransfer_message', msg,
    'etransfer_to', 'payments@livinglearningacademy.com', 'email', f->>'email');
end $$;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to service_role;

-- The checkout function saves the Square checkout it built.
create or replace function public.order_set_checkout(p_order uuid, p_link_id text, p_square_order text, p_url text, p_variation text)
returns void language sql security definer set search_path = public as $$
  update public.orders set square_payment_link_id = p_link_id, square_order_id = p_square_order,
    checkout_url = p_url, square_plan_variation = p_variation where id = p_order;
$$;
-- Square couldn't build the checkout: undo the order so the spots free up.
create or replace function public.order_abort(p_order uuid)
returns void language sql security definer set search_path = public as $$
  update public.registrations set cancelled = true where order_id = p_order;
  update public.orders set status = 'cancelled', staff_notes = 'Square checkout could not be created' where id = p_order;
$$;
create or replace function public.square_plan_get(p_amount int, p_months int)
returns text language sql stable security definer set search_path = public as $$
  select variation_id from public.square_plans where amount_cents = p_amount and months = p_months;
$$;
create or replace function public.square_plan_save(p_amount int, p_months int, p_variation text)
returns void language sql security definer set search_path = public as $$
  insert into public.square_plans (amount_cents, months, variation_id) values (p_amount, p_months, p_variation)
  on conflict (amount_cents, months) do update set variation_id = excluded.variation_id;
$$;
revoke all on function public.order_set_checkout(uuid, text, text, text, text), public.order_abort(uuid),
  public.square_plan_get(int, int), public.square_plan_save(int, int, text) from public, anon, authenticated;
grant execute on function public.order_set_checkout(uuid, text, text, text, text), public.order_abort(uuid),
  public.square_plan_get(int, int), public.square_plan_save(int, int, text) to service_role;

-- ---------------------------------------------------------------- emails to the family
-- e-Transfer: what to send, right away.
create or replace function public.lla_send_order_instructions(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; hold timestamptz; one boolean;
begin
  select * into o from public.orders where id = p_order;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  select min(hold_expires_at) into hold from public.registrations where order_id = o.id;
  perform send_email(array[o.email],
    'You''re registered: ' || case when one then (o.items->0->>'child') || ' in ' || (o.items->0->>'name') else lla_join(kids) end,
    lla_email_wrap(
      '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
      || '<p>Thank you for registering ' || lla_html(lla_join(kids)) || '. We''re so excited!</p>'
      || lla_order_items_html(o, false)
      || '<p><strong>How to pay:</strong> send an Interac e-Transfer</p>'
      || '<table style="border-collapse:collapse">'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Amount</td><td><strong>' || lla_money(o.total_cents) || '</strong>'
      || case when o.items @> '[{"family_discount": true}]' then ' (includes your 10% family discount)' else '' end || '</td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">To</td><td><strong>payments@livinglearningacademy.com</strong></td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Message</td><td><strong>' || lla_html(o.etransfer_message) || '</strong></td></tr></table>'
      || '<p>We''ll watch for your e-Transfer from <strong>' || lla_html(coalesce(o.etransfer_from, o.email)) || '</strong>. '
      || case when one then 'Your spot is' else 'Your spots are' end || ' held for 12 hours while we wait for payment.</p>'
      || '<p>Once your e-Transfer arrives, we''ll email a thank-you with the address and everything you need for the first class. '
      || 'Our mentors look forward to helping ' || lla_html(lla_join(kids)) || ' build confidence, character and real-world skills!</p>'
      || '<p>Questions? Just reply to this email.</p>'));
end $$;

-- Paid: the thank-you with the address (once per order).
create or replace function public.lla_send_thank_you(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; pay text;
begin
  select * into o from public.orders where id = p_order;
  if o.thank_you_sent_at is not null then return; end if;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  pay := case
    when o.plan = 'monthly' then 'Paid today: <strong>' || lla_money(o.monthly_cents) || '</strong> by card. Your second payment of '
      || lla_money(o.monthly_cents) || ' will be charged to the same card on '
      || to_char((coalesce(o.paid_at, now()) + interval '1 month') at time zone 'America/Vancouver', 'FMMonth FMDD')
      || ', and then your plan ends automatically.'
    else 'Paid in full: <strong>' || lla_money(o.total_cents) || '</strong> by ' || case o.method when 'etransfer' then 'e-Transfer' else 'card' end || '.' end;
  perform send_email(array[o.email],
    'You''re all set! ' || case when one then (o.items->0->>'child') || ' is registered for ' || (o.items->0->>'name')
                                when array_length(kids, 1) = 1 then kids[1] || ' is registered'
                                else lla_join(kids) || ' are registered' end,
    lla_email_wrap(
      '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
      || '<p>Thank you! Your payment is in, and ' || lla_html(lla_join(kids)) || ' '
      || case when array_length(kids, 1) > 1 then 'are' else 'is' end || ' all set.</p>'
      || lla_order_items_html(o, true)
      || '<p>' || pay || '</p>'
      || '<p>Our mentors look forward to helping ' || lla_html(lla_join(kids)) || ' build confidence, character and real-world skills!</p>'
      || '<p><strong>Know a family who would love LLA?</strong> When they register and add your name, you get $20 off.</p>'
      || '<p>Questions? Just reply to this email.</p>'));
  update public.orders set thank_you_sent_at = now() where id = o.id;
end $$;

-- Card checkout left unfinished: ONE reminder, about an hour later, while the spots are still held.
create or replace function public.send_checkout_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; hold timestamptz; n int := 0;
begin
  -- Orders whose every spot was released are over.
  update public.orders o set status = 'released'
   where o.status = 'pending' and not exists (
     select 1 from public.registrations r where r.order_id = o.id and r.released_at is null and not r.cancelled);
  for o in
    select * from public.orders
    where status = 'pending' and method = 'card' and checkout_url is not null and reminder_sent_at is null
      and created_at <= now() - interval '1 hour' and created_at > now() - interval '20 hours'
  loop
    kids := lla_order_children(o);
    one := jsonb_array_length(o.items) = 1;
    select min(hold_expires_at) into hold from public.registrations where order_id = o.id and not cancelled and released_at is null;
    perform send_email(array[o.email],
      case when one then 'You''re almost done securing ' || (o.items->0->>'child') || '''s spot in ' || (o.items->0->>'name')
           else 'You''re almost done securing your spots for ' || lla_join(kids) end,
      lla_email_wrap(
        '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
        || '<p>You''re almost done! ' || case when one then 'This spot is' else 'These spots are' end
        || ' held for you until <strong>' || to_char(hold at time zone 'America/Vancouver', 'FMMonth FMDD "at" FMHH12:MI am') || '</strong> (Pacific).</p>'
        || lla_order_items_html(o, false)
        || '<p style="margin:22px 0"><a href="' || lla_html(o.checkout_url) || '" style="background:#b8924a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Complete your payment</a></p>'
        || '<p>If you''ve already paid, thank you, and please ignore this email.</p>'
        || '<p>Questions? Just reply to this email.</p>'));
    update public.orders set reminder_sent_at = now() where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.lla_send_order_instructions(uuid), public.lla_send_thank_you(uuid), public.send_checkout_reminders()
  from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lla-checkout-reminders';
select cron.schedule('lla-checkout-reminders', '*/10 * * * *', 'select public.send_checkout_reminders();');

-- ---------------------------------------------------------------- paid
-- Order marked paid (by Square, or by staff): every registration in it is paid, family gets the thank-you, staff get a note.
create or replace function public.orders_after_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.registrations set paid = true, cancelled = false, released_at = null where order_id = new.id and not paid;
  perform lla_send_thank_you(new.id);
  perform send_email(lla_staff_emails(),
    'Paid: ' || lla_join(lla_order_children(new)) || ' (' || lla_money(case when new.plan = 'monthly' then new.monthly_cents else new.total_cents end)
      || case when new.plan = 'monthly' then ' first monthly payment' else '' end || ')',
    lla_email_wrap('<p><strong>Payment received</strong> from ' || lla_html(new.parent_name) || ' · ' || lla_html(new.email) || ' · ' || lla_html(new.phone) || '</p>'
      || lla_order_items_html(new, false)
      || '<p>' || case new.method when 'etransfer' then 'e-Transfer' else 'Card' end || ', '
      || case when new.plan = 'monthly' then lla_money(new.monthly_cents) || ' a month for ' || new.months || ' months (ends by itself)'
              else 'paid in full: ' || lla_money(new.total_cents) end || '. The thank-you email with the address has gone to the family.</p>'),
    new.email);
  return new;
exception when others then
  raise warning 'order paid handling failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists orders_after_paid on public.orders;
create trigger orders_after_paid after update of status on public.orders
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.orders_after_paid();

-- Make sure paid_at is set however an order becomes paid.
create or replace function public.orders_before_update()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.payments_received := greatest(new.payments_received, 1);
  end if;
  return new;
end $$;
drop trigger if exists orders_before_update on public.orders;
create trigger orders_before_update before update on public.orders
  for each row execute function public.orders_before_update();

-- Staff ticked paid on a registration: when every registration in its order is paid, the order is paid.
-- (Older registrations without an order get their own thank-you is not possible; staff email them as before.)
create or replace function public.registrations_after_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and not exists (
       select 1 from public.registrations r where r.order_id = new.order_id and not r.paid and not r.cancelled) then
    update public.orders set status = 'paid' where id = new.order_id and status <> 'paid';
  end if;
  return new;
end $$;
drop trigger if exists registrations_after_paid on public.registrations;
create trigger registrations_after_paid after update of paid on public.registrations
  for each row when (new.paid and not old.paid)
  execute function public.registrations_after_paid();

-- ---------------------------------------------------------------- Square notifications
-- Called by the square-webhook function (after it checks Square's signature).
create or replace function public.square_event(p_event jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  ev_id  text := p_event->>'event_id';
  ev     text := p_event->>'type';
  obj    jsonb := p_event->'data'->'object';
  pay    jsonb; inv jsonb; sub jsonb;
  o      public.orders;
  res    text := 'ignored';
  ref    text;
begin
  if ev_id is null then return 'no event id'; end if;
  insert into public.square_events (event_id, type, payload) values (ev_id, ev, p_event) on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  if ev in ('payment.created', 'payment.updated') then
    pay := obj->'payment';
    if pay->>'status' = 'COMPLETED' then
      ref := substring(coalesce(pay->>'note', '') from 'LLA order ([0-9a-f-]{36})');
      select * into o from public.orders
       where (square_order_id is not null and square_order_id = pay->>'order_id') or id::text = ref
       order by created_at desc limit 1;
      if found then
        if not (pay->>'id' = any (o.square_payment_ids)) then
          update public.orders set square_payment_ids = square_payment_ids || (pay->>'id'), status = 'paid' where id = o.id;
        end if;
        res := 'paid order ' || o.id;
      else
        res := 'payment not matched';
      end if;
    end if;

  elsif ev in ('subscription.created', 'subscription.updated') then
    sub := obj->'subscription';
    select * into o from public.orders where square_subscription_id = sub->>'id';
    if not found then
      -- New subscription from one of our monthly checkouts: newest pending order with that plan.
      select * into o from public.orders
       where square_subscription_id is null and plan = 'monthly' and square_plan_variation = sub->>'plan_variation_id'
         and status in ('pending', 'paid') and created_at > now() - interval '2 days'
       order by created_at desc limit 1;
      if found then
        -- Square only creates the subscription once the first payment succeeds.
        update public.orders set square_subscription_id = sub->>'id',
               status = case when sub->>'status' = 'ACTIVE' then 'paid' else status end where id = o.id;
        res := 'linked subscription to ' || o.id;
      else res := 'subscription not matched'; end if;
    else res := 'subscription known';
    end if;

  elsif ev = 'invoice.payment_made' then
    inv := obj->'invoice';
    select * into o from public.orders where square_subscription_id = inv->>'subscription_id';
    if found then
      -- payments_received = how many subscription invoices have been paid (idempotent).
      update public.orders set status = 'paid', payments_received = greatest(payments_received, (
        select count(*)::int from public.square_events e
        where e.type = 'invoice.payment_made' and e.payload->'data'->'object'->'invoice'->>'subscription_id' = inv->>'subscription_id'))
       where id = o.id;
      res := 'subscription payment for ' || o.id;
    else res := 'invoice not matched'; end if;

  elsif ev = 'invoice.scheduled_charge_failed' then
    inv := obj->'invoice';
    select * into o from public.orders where square_subscription_id = inv->>'subscription_id';
    perform send_email(lla_staff_emails(),
      'Monthly payment failed: ' || coalesce(o.parent_name, 'a family') || coalesce(' (' || lla_join(lla_order_children(o)) || ')', ''),
      lla_email_wrap('<p><strong>A monthly card payment didn''t go through.</strong> Square will show it under Invoices.</p>'
        || case when o.id is not null then '<p>' || lla_html(o.parent_name) || ' · ' || lla_html(o.email) || ' · ' || lla_html(o.phone) || '</p>' || lla_order_items_html(o, false) else '' end
        || '<p><strong>Draft reminder to send the family</strong> (review, then send from info@):</p>'
        || '<div style="border-left:3px solid #b8924a;padding:8px 14px;color:#1d2a44">'
        || '<p>Hi ' || lla_html(coalesce(split_part(trim(o.parent_name), ' ', 1), 'there')) || ',</p>'
        || '<p>We tried to process your monthly payment of ' || coalesce(lla_money(o.monthly_cents), 'your course') || ' for '
        || lla_html(coalesce(lla_join(lla_order_children(o)), 'your child')) || '''s course, but it didn''t go through. '
        || 'This can happen when a card expires or a bank declines the charge.</p>'
        || '<p>Could you check your card and reply to this email, or let us know if you''d like to pay another way? We''re happy to help.</p>'
        || '<p>Thank you,<br>Living Learning Academy</p></div>'),
      coalesce(o.email, 'info@livinglearningacademy.com'));
    res := 'failed charge alert sent';
  end if;

  update public.square_events set result = res where event_id = ev_id;
  return res;
end $$;
revoke all on function public.square_event(jsonb) from public, anon, authenticated;
grant execute on function public.square_event(jsonb) to service_role;

-- ---------------------------------------------------------------- old flow
-- Registrations that belong to an order get their family emails from the order (above),
-- so the per-registration parent email only goes out for the old one-course form.
-- (registrations_after_insert: parent email only when payment_choice = 'etransfer' AND order_id is null.)
-- Monthly plans from the new checkout end by themselves, so "time to cancel" is only for the old links.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.registrations_after_insert()'::regprocedure);
  if position('and new.order_id is null then' in d) = 0 then
    d := replace(d, E'  if new.payment_choice = ''etransfer'' then\n  perform send_email(',
                    E'  if new.payment_choice = ''etransfer'' and new.order_id is null then\n  perform send_email(');
    if position('and new.order_id is null then' in d) = 0 then raise exception 'registrations_after_insert not updated'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.send_cancel_reminders()'::regprocedure);
  if position('and order_id is null' in d) = 0 then
    d := replace(d, 'and cancel_reminder_sent_at is null', 'and cancel_reminder_sent_at is null and order_id is null');
    if position('and order_id is null' in d) = 0 then raise exception 'send_cancel_reminders not updated'; end if;
    execute d;
  end if;
end $do$;

-- ---------------------------------------------------------------- class address (sent in the paid thank-you)
alter table public.course_capacity add column if not exists unit text;  -- e.g. 'Building A, Unit 1'
update public.course_capacity set unit = case when course_id = 'music-theatre' then 'Building A, Unit 8' else 'Building A, Unit 1' end;
update public.locations set address = '20178 96, Langley Twp, BC V1M 0B2' where place = 'Langley, BC';
update public.course_capacity set course_name = 'LLA Young Entrepreneurs', ref_name = 'Young Entrepreneurs' where course_id = 'intro-entrepreneurship';

create or replace function public.lla_order_items_html(o public.orders, p_address boolean)
returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(
    '<div style="border:1px solid #eee7da;border-radius:8px;padding:12px 14px;margin:10px 0">'
    || '<strong>' || lla_html(x->>'name') || '</strong> · ' || lla_html(x->>'child')
    || coalesce('<br><span style="color:#6b7280">When:</span> ' || lla_html(x->>'schedule'), '')
    || coalesce('<br><span style="color:#6b7280">Where:</span> ' || case
         when p_address and l.address is not null then lla_html(coalesce(c.unit || ', ', '') || l.address) || coalesce('<br><span style="color:#6b7280">' || lla_html(l.notes) || '</span>', '')
         when p_address then lla_html(x->>'place') || ' (we''ll email the exact address before the first class)'
         else lla_html(x->>'place') end, '')
    || '</div>', '' order by ord), '')
  from jsonb_array_elements(o.items) with ordinality as t(x, ord)
  left join public.locations l on l.place = x->>'place'
  left join public.course_capacity c on c.course_id = x->>'course_id';
$$;

-- ---------------------------------------------------------------- safety net: ask Square every 10 minutes
-- If a Square notification is ever missed, the checkout function ({"action":"sync"}) checks unpaid card orders with Square.
create or replace function public.orders_to_sync()
returns table (id uuid, square_order_id text) language sql stable security definer set search_path = public as $$
  select o.id, o.square_order_id from public.orders o
  where o.method = 'card' and o.plan = 'full' and o.status in ('pending', 'replaced', 'released')
    and o.square_order_id is not null and o.created_at > now() - interval '3 days';
$$;
create or replace function public.order_paid_from_square(p_order uuid, p_payment_ids text[])
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'paid',
    square_payment_ids = array(select distinct x from unnest(square_payment_ids || coalesce(p_payment_ids, '{}')) x)
  where id = p_order and status <> 'paid';
  return found;
end $$;
revoke all on function public.orders_to_sync(), public.order_paid_from_square(uuid, text[]) from public, anon, authenticated;
grant execute on function public.orders_to_sync(), public.order_paid_from_square(uuid, text[]) to service_role;
select cron.unschedule(jobid) from cron.job where jobname = 'lla-square-sync';
select cron.schedule('lla-square-sync', '*/10 * * * *', $c$select net.http_post(url := 'https://xvohkszqihispaabdpya.supabase.co/functions/v1/checkout', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"action": "sync"}'::jsonb)$c$);
-- Checkout: a family's cart becomes ONE order (one or more courses; later books, gift cards...).
--   * Card: the Edge Function "checkout" builds a Square checkout for the whole order.
--     Monthly = a Square subscription that stops by itself after 2 payments.
--     Square tells us when it's paid (Edge Function "square-webhook" -> square_event()).
--   * e-Transfer: one instructions email right away; staff mark the order paid when money arrives.
-- Emails to the family:
--   card:       nothing at checkout; ONE reminder if they leave without paying; thank-you once paid.
--   e-Transfer: instructions right away; thank-you once paid.
-- Staff can mark paid either way: orders.status = 'paid', or tick paid on every registration in the order.

-- ---------------------------------------------------------------- courses: price, place, schedule
alter table public.course_capacity
  add column if not exists ref_name      text,                         -- short name for e-Transfer messages
  add column if not exists price_cents   int  not null default 27800,  -- pay in full
  add column if not exists monthly_cents int  not null default 13900,  -- per month
  add column if not exists months        int  not null default 2,
  add column if not exists place         text,                         -- e.g. 'Langley, BC' (see public.locations)
  add column if not exists schedule      text,                         -- e.g. 'Fridays 9–11 am, January 15 to March 5, 2027 (8 weeks)'
  add column if not exists staff_only    boolean not null default false;

update public.course_capacity set course_name = 'LLA Music Theatre & Character', ref_name = 'Music Theatre', place = 'Langley, BC',
  schedule = 'Fridays 9–11 am, January 15 to March 5, 2027 (8 weeks)' where course_id = 'music-theatre';
update public.course_capacity set course_name = 'LLA Jr. Truth Detectives', ref_name = 'Truth Detectives', place = 'Langley, BC',
  schedule = 'Fridays 12–2 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'truth-hunters';
update public.course_capacity set course_name = 'LLA Intro to Entrepreneurship', ref_name = 'Entrepreneurship', place = 'Langley, BC',
  schedule = 'Fridays 12–2 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'intro-entrepreneurship';
update public.course_capacity set course_name = 'LLA Kidpreneurs', ref_name = 'Kidpreneurs', place = 'Langley, BC',
  schedule = 'Fridays 3–5 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'kidpreneurs';
update public.course_capacity set course_name = 'LLA Spot the Spin', ref_name = 'Spot the Spin', place = 'Langley, BC',
  schedule = 'Fridays 3:30–5:30 pm, January 15 to March 5, 2027 (8 weeks)' where course_id = 'critical-thinking-debate';
-- $1 course for staff testing only (only a staff email can order it; not shown on the site).
insert into public.course_capacity (course_id, course_name, capacity, ref_name, price_cents, monthly_cents, months, place, schedule, staff_only)
values ('test-course', 'LLA Test Course', 100, 'Test', 100, 100, 2, 'Langley, BC', 'Test only', true)
on conflict (course_id) do update set staff_only = true, price_cents = 100, monthly_cents = 100;

-- Address for each place, sent in the paid thank-you. Fill in address (and notes) in Table Editor.
create table if not exists public.locations (
  place   text primary key,
  address text,     -- full street address
  notes   text      -- parking, entrance, what to bring...
);
insert into public.locations (place) values ('Langley, BC') on conflict do nothing;
alter table public.locations enable row level security;
revoke all on public.locations from anon, authenticated;

-- ---------------------------------------------------------------- orders
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  term                   text not null default 'winter-2027',
  parent_name            text not null,
  email                  text not null,
  phone                  text not null,
  method                 text not null check (method in ('card', 'etransfer')),
  plan                   text not null check (plan in ('full', 'monthly')),
  items                  jsonb not null default '[]',   -- what was bought (snapshot for emails)
  total_cents            int not null default 0,        -- pay in full total
  monthly_cents          int,                           -- per month, monthly plans only
  months                 int not null default 2,
  status                 text not null default 'pending' check (status in ('pending', 'paid', 'released', 'replaced', 'cancelled')),
  paid_at                timestamptz,
  payments_received      int not null default 0,
  etransfer_from         text,
  etransfer_message      text,
  referred_by            text,
  source                 text,
  checkout_url           text,
  square_payment_link_id text,
  square_order_id        text,
  square_plan_variation  text,
  square_subscription_id text,
  square_payment_ids     text[] not null default '{}',
  reminder_sent_at       timestamptz,
  thank_you_sent_at      timestamptz,
  staff_notes            text
);
create index if not exists orders_square_order_idx on public.orders (square_order_id);
create index if not exists orders_square_sub_idx on public.orders (square_subscription_id);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

alter table public.registrations add column if not exists order_id uuid references public.orders (id) on delete set null;
create index if not exists registrations_order_idx on public.registrations (order_id);

-- Every Square notification, for checking what happened.
create table if not exists public.square_events (
  event_id    text primary key,
  received_at timestamptz not null default now(),
  type        text,
  result      text,
  payload     jsonb
);
alter table public.square_events enable row level security;
revoke all on public.square_events from anon, authenticated;

-- Square monthly plans, one per monthly amount (created by the checkout function as needed).
create table if not exists public.square_plans (
  amount_cents int not null,
  months       int not null,
  variation_id text not null,
  created_at   timestamptz not null default now(),
  primary key (amount_cents, months)
);
alter table public.square_plans enable row level security;
revoke all on public.square_plans from anon, authenticated;

-- ---------------------------------------------------------------- small helpers
create or replace function public.lla_money(c int)
returns text language sql immutable as $$
  select case when c % 100 = 0 then '$' || to_char(c / 100, 'FM999,999') else to_char(c / 100.0, 'FM$999,999,990.00') end;
$$;

-- 'Sam', 'Sam and Eli', 'Sam, Eli and Ava'
create or replace function public.lla_join(p text[])
returns text language sql immutable as $$
  select case coalesce(array_length(p, 1), 0)
    when 0 then '' when 1 then p[1]
    else array_to_string(p[1:array_length(p, 1) - 1], ', ') || ' and ' || p[array_length(p, 1)] end;
$$;

create or replace function public.lla_order_children(o public.orders)
returns text[] language sql stable as $$
  select coalesce(array_agg(distinct x->>'child'), '{}') from jsonb_array_elements(o.items) x;
$$;

-- One box per course in the order. p_address: also show the street address (thank-you only).
create or replace function public.lla_order_items_html(o public.orders, p_address boolean)
returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(
    '<div style="border:1px solid #eee7da;border-radius:8px;padding:12px 14px;margin:10px 0">'
    || '<strong>' || lla_html(x->>'name') || '</strong> · ' || lla_html(x->>'child')
    || coalesce('<br><span style="color:#6b7280">When:</span> ' || lla_html(x->>'schedule'), '')
    || coalesce('<br><span style="color:#6b7280">Where:</span> ' || case
         when p_address and l.address is not null then lla_html(l.address) || coalesce('<br><span style="color:#6b7280">' || lla_html(l.notes) || '</span>', '')
         when p_address then lla_html(x->>'place') || ' (we''ll email the exact address before the first class)'
         else lla_html(x->>'place') end, '')
    || '</div>', '' order by ord), '')
  from jsonb_array_elements(o.items) with ordinality as t(x, ord)
  left join public.locations l on l.place = x->>'place';
$$;

-- Plain payment summary (staff alerts, release alerts).
create or replace function public.lla_payment_text(r public.registrations)
returns text language sql stable set search_path = public as $$
  select case
    when o.id is not null then
      case o.method when 'etransfer' then 'Interac e-Transfer, ' else 'Card, ' end
      || case when o.plan = 'monthly' then lla_money(o.monthly_cents) || ' a month for ' || o.months || ' months'
              else 'paid in full: ' || lla_money(o.total_cents) end
      || case when jsonb_array_length(o.items) > 1 then ' (order of ' || jsonb_array_length(o.items) || ' courses)' else '' end
      || case when r.family_discount then ', 10% family discount on this course' else '' end
    when r.payment_choice = 'etransfer' then
      'Interac e-Transfer, paid in full: ' || case when r.family_discount then '$250.20 (10% family discount)' else '$278' end
    when r.payment_plan = 'monthly' then
      'Card, monthly: ' || case when r.family_discount then '$125.10' else '$139' end || ' today and again in one month'
    else
      'Card, paid in full: $278' || case when r.family_discount then ' (with code LLAFAMILY10: $250.20)' else '' end
  end
  from (select 1) one left join public.orders o on o.id = r.order_id;
$$;

-- ---------------------------------------------------------------- create an order (called by the checkout function)
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f        jsonb := p->'family';
  meth     text := p->>'method';
  pl       text := coalesce(p->>'plan', 'full');
  oid      uuid := gen_random_uuid();
  it       jsonb;
  c        public.course_capacity;
  reg      public.registrations;
  v_items  jsonb := '[]';
  v_total  int := 0;
  per_mo   int := 0;
  mos      int := 2;
  msgs     text[] := '{}';
  msg      text;
  amt      int;
  mamt     int;
  is_staff boolean;
  hkey     text;
begin
  if meth is null or meth not in ('card', 'etransfer') then raise exception 'bad_method'; end if;
  if pl not in ('full', 'monthly') then raise exception 'bad_plan'; end if;
  if pl = 'monthly' and meth <> 'card' then raise exception 'monthly_is_card_only'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 8 then raise exception 'bad_items'; end if;
  if coalesce((p->>'policy_ack')::boolean, false) is not true then raise exception 'policy_ack_required'; end if;
  if f is null or coalesce(f->>'email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad_email'; end if;
  is_staff := lower(f->>'email') = any (select lower(x) from unnest(lla_staff_emails()) x);
  hkey := household_key(f->>'email', f->>'phone');

  -- Starting over? An earlier unpaid card checkout from this household is replaced (its spots free up).
  update public.registrations set cancelled = true
   where order_id in (select id from public.orders where status = 'pending' and method = 'card' and household_key(email, phone) = hkey);
  update public.orders set status = 'replaced'
   where status = 'pending' and method = 'card' and household_key(email, phone) = hkey;

  insert into public.orders (id, parent_name, email, phone, method, plan, etransfer_from, referred_by, source)
  values (oid, left(f->>'parent_name', 120), left(f->>'email', 200), left(f->>'phone', 40), meth, pl,
          case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
          nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40));

  for it in select value from jsonb_array_elements(p->'items') loop
    select * into c from public.course_capacity where course_id = it->>'course_id';
    if not found or (c.staff_only and not is_staff) then raise exception 'unknown_course'; end if;
    begin
      insert into public.registrations (course_id, course_name, parent_name, email, phone, street_address, city, province, postal_code,
        child_first_name, child_last_name, child_age, child_gender, payment_choice, payment_plan, policy_ack,
        etransfer_from, referred_by, source, order_id, location, schedule)
      values (c.course_id, c.course_name, left(f->>'parent_name', 120), left(f->>'email', 200), left(f->>'phone', 40),
        left(f->>'street_address', 200), left(f->>'city', 100), left(f->>'province', 60),
        upper(regexp_replace(regexp_replace(coalesce(f->>'postal_code', ''), '[ -]', '', 'g'), '^(...)(...)$', '\1 \2')),
        left(trim(it->>'child_first_name'), 80), left(trim(it->>'child_last_name'), 80), (it->>'child_age')::int, it->>'child_gender',
        case when meth = 'etransfer' then 'etransfer' else 'square' end, pl, true,
        case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
        nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40), oid, c.place, c.schedule)
      returning * into reg;
    exception when raise_exception then
      if sqlerrm = 'course_full' then raise exception 'course_full:%', c.course_id; end if;
      raise;
    end;
    -- Family discount: decided by the database (first course in a new household pays full price).
    amt  := case when reg.family_discount then round(c.price_cents * 0.9)::int else c.price_cents end;
    mamt := case when reg.family_discount then round(c.monthly_cents * 0.9)::int else c.monthly_cents end;
    v_total := v_total + amt; per_mo := per_mo + mamt; mos := c.months;
    msgs := msgs || (coalesce(c.ref_name, c.course_name) || ' ' || reg.child_first_name);
    v_items := v_items || jsonb_build_object('registration_id', reg.id, 'course_id', c.course_id, 'name', c.course_name,
      'ref', c.ref_name, 'child', reg.child_first_name, 'child_last', reg.child_last_name,
      'amount_cents', amt, 'monthly_cents', mamt, 'family_discount', reg.family_discount,
      'place', c.place, 'schedule', c.schedule, 'kind', 'course');
  end loop;

  msg := left(array_to_string(msgs, ', '), 120);
  update public.orders set items = v_items, total_cents = v_total,
      monthly_cents = case when pl = 'monthly' then per_mo end, months = mos, etransfer_message = msg
    where id = oid;
  update public.registrations set payment_reference = msg where order_id = oid;

  if meth = 'etransfer' then perform lla_send_order_instructions(oid); end if;

  return jsonb_build_object('order_id', oid, 'method', meth, 'plan', pl, 'total_cents', v_total,
    'monthly_cents', per_mo, 'months', mos, 'items', v_items, 'etransfer_message', msg,
    'etransfer_to', 'payments@livinglearningacademy.com', 'email', f->>'email');
end $$;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to service_role;

-- The checkout function saves the Square checkout it built.
create or replace function public.order_set_checkout(p_order uuid, p_link_id text, p_square_order text, p_url text, p_variation text)
returns void language sql security definer set search_path = public as $$
  update public.orders set square_payment_link_id = p_link_id, square_order_id = p_square_order,
    checkout_url = p_url, square_plan_variation = p_variation where id = p_order;
$$;
-- Square couldn't build the checkout: undo the order so the spots free up.
create or replace function public.order_abort(p_order uuid)
returns void language sql security definer set search_path = public as $$
  update public.registrations set cancelled = true where order_id = p_order;
  update public.orders set status = 'cancelled', staff_notes = 'Square checkout could not be created' where id = p_order;
$$;
create or replace function public.square_plan_get(p_amount int, p_months int)
returns text language sql stable security definer set search_path = public as $$
  select variation_id from public.square_plans where amount_cents = p_amount and months = p_months;
$$;
create or replace function public.square_plan_save(p_amount int, p_months int, p_variation text)
returns void language sql security definer set search_path = public as $$
  insert into public.square_plans (amount_cents, months, variation_id) values (p_amount, p_months, p_variation)
  on conflict (amount_cents, months) do update set variation_id = excluded.variation_id;
$$;
revoke all on function public.order_set_checkout(uuid, text, text, text, text), public.order_abort(uuid),
  public.square_plan_get(int, int), public.square_plan_save(int, int, text) from public, anon, authenticated;
grant execute on function public.order_set_checkout(uuid, text, text, text, text), public.order_abort(uuid),
  public.square_plan_get(int, int), public.square_plan_save(int, int, text) to service_role;

-- ---------------------------------------------------------------- emails to the family
-- e-Transfer: what to send, right away.
create or replace function public.lla_send_order_instructions(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; hold timestamptz; one boolean;
begin
  select * into o from public.orders where id = p_order;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  select min(hold_expires_at) into hold from public.registrations where order_id = o.id;
  perform send_email(array[o.email],
    'You''re registered: ' || case when one then (o.items->0->>'child') || ' in ' || (o.items->0->>'name') else lla_join(kids) end,
    lla_email_wrap(
      '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
      || '<p>Thank you for registering ' || lla_html(lla_join(kids)) || '. We''re so excited!</p>'
      || lla_order_items_html(o, false)
      || '<p><strong>How to pay:</strong> send an Interac e-Transfer</p>'
      || '<table style="border-collapse:collapse">'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Amount</td><td><strong>' || lla_money(o.total_cents) || '</strong>'
      || case when o.items @> '[{"family_discount": true}]' then ' (includes your 10% family discount)' else '' end || '</td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">To</td><td><strong>payments@livinglearningacademy.com</strong></td></tr>'
      || '<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Message</td><td><strong>' || lla_html(o.etransfer_message) || '</strong></td></tr></table>'
      || '<p>We''ll watch for your e-Transfer from <strong>' || lla_html(coalesce(o.etransfer_from, o.email)) || '</strong>. '
      || case when one then 'Your spot is' else 'Your spots are' end || ' held for 12 hours while we wait for payment.</p>'
      || '<p>Once your e-Transfer arrives, we''ll email a thank-you with the address and everything you need for the first class. '
      || 'Our mentors look forward to helping ' || lla_html(lla_join(kids)) || ' build confidence, character and real-world skills!</p>'
      || '<p>Questions? Just reply to this email.</p>'));
end $$;

-- Paid: the thank-you with the address (once per order).
create or replace function public.lla_send_thank_you(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; pay text;
begin
  select * into o from public.orders where id = p_order;
  if o.thank_you_sent_at is not null then return; end if;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  pay := case
    when o.plan = 'monthly' then 'Paid today: <strong>' || lla_money(o.monthly_cents) || '</strong> by card. Your second payment of '
      || lla_money(o.monthly_cents) || ' will be charged to the same card on '
      || to_char((coalesce(o.paid_at, now()) + interval '1 month') at time zone 'America/Vancouver', 'FMMonth FMDD')
      || ', and then your plan ends automatically.'
    else 'Paid in full: <strong>' || lla_money(o.total_cents) || '</strong> by ' || case o.method when 'etransfer' then 'e-Transfer' else 'card' end || '.' end;
  perform send_email(array[o.email],
    'You''re all set! ' || case when one then (o.items->0->>'child') || ' is registered for ' || (o.items->0->>'name')
                                when array_length(kids, 1) = 1 then kids[1] || ' is registered'
                                else lla_join(kids) || ' are registered' end,
    lla_email_wrap(
      '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
      || '<p>Thank you! Your payment is in, and ' || lla_html(lla_join(kids)) || ' '
      || case when array_length(kids, 1) > 1 then 'are' else 'is' end || ' all set.</p>'
      || lla_order_items_html(o, true)
      || '<p>' || pay || '</p>'
      || '<p>Our mentors look forward to helping ' || lla_html(lla_join(kids)) || ' build confidence, character and real-world skills!</p>'
      || '<p><strong>Know a family who would love LLA?</strong> When they register and add your name, you get $20 off.</p>'
      || '<p>Questions? Just reply to this email.</p>'));
  update public.orders set thank_you_sent_at = now() where id = o.id;
end $$;

-- Card checkout left unfinished: ONE reminder, about an hour later, while the spots are still held.
create or replace function public.send_checkout_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; hold timestamptz; n int := 0;
begin
  -- Orders whose every spot was released are over.
  update public.orders o set status = 'released'
   where o.status = 'pending' and not exists (
     select 1 from public.registrations r where r.order_id = o.id and r.released_at is null and not r.cancelled);
  for o in
    select * from public.orders
    where status = 'pending' and method = 'card' and checkout_url is not null and reminder_sent_at is null
      and created_at <= now() - interval '1 hour' and created_at > now() - interval '20 hours'
  loop
    kids := lla_order_children(o);
    one := jsonb_array_length(o.items) = 1;
    select min(hold_expires_at) into hold from public.registrations where order_id = o.id and not cancelled and released_at is null;
    perform send_email(array[o.email],
      case when one then 'You''re almost done securing ' || (o.items->0->>'child') || '''s spot in ' || (o.items->0->>'name')
           else 'You''re almost done securing your spots for ' || lla_join(kids) end,
      lla_email_wrap(
        '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
        || '<p>You''re almost done! ' || case when one then 'This spot is' else 'These spots are' end
        || ' held for you until <strong>' || to_char(hold at time zone 'America/Vancouver', 'FMMonth FMDD "at" FMHH12:MI am') || '</strong> (Pacific).</p>'
        || lla_order_items_html(o, false)
        || '<p style="margin:22px 0"><a href="' || lla_html(o.checkout_url) || '" style="background:#b8924a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block">Complete your payment</a></p>'
        || '<p>If you''ve already paid, thank you, and please ignore this email.</p>'
        || '<p>Questions? Just reply to this email.</p>'));
    update public.orders set reminder_sent_at = now() where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.lla_send_order_instructions(uuid), public.lla_send_thank_you(uuid), public.send_checkout_reminders()
  from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lla-checkout-reminders';
select cron.schedule('lla-checkout-reminders', '*/10 * * * *', 'select public.send_checkout_reminders();');

-- ---------------------------------------------------------------- paid
-- Order marked paid (by Square, or by staff): every registration in it is paid, family gets the thank-you, staff get a note.
create or replace function public.orders_after_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.registrations set paid = true, cancelled = false, released_at = null where order_id = new.id and not paid;
  perform lla_send_thank_you(new.id);
  perform send_email(lla_staff_emails(),
    'Paid: ' || lla_join(lla_order_children(new)) || ' (' || lla_money(case when new.plan = 'monthly' then new.monthly_cents else new.total_cents end)
      || case when new.plan = 'monthly' then ' first monthly payment' else '' end || ')',
    lla_email_wrap('<p><strong>Payment received</strong> from ' || lla_html(new.parent_name) || ' · ' || lla_html(new.email) || ' · ' || lla_html(new.phone) || '</p>'
      || lla_order_items_html(new, false)
      || '<p>' || case new.method when 'etransfer' then 'e-Transfer' else 'Card' end || ', '
      || case when new.plan = 'monthly' then lla_money(new.monthly_cents) || ' a month for ' || new.months || ' months (ends by itself)'
              else 'paid in full: ' || lla_money(new.total_cents) end || '. The thank-you email with the address has gone to the family.</p>'),
    new.email);
  return new;
exception when others then
  raise warning 'order paid handling failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists orders_after_paid on public.orders;
create trigger orders_after_paid after update of status on public.orders
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.orders_after_paid();

-- Make sure paid_at is set however an order becomes paid.
create or replace function public.orders_before_update()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.payments_received := greatest(new.payments_received, 1);
  end if;
  return new;
end $$;
drop trigger if exists orders_before_update on public.orders;
create trigger orders_before_update before update on public.orders
  for each row execute function public.orders_before_update();

-- Staff ticked paid on a registration: when every registration in its order is paid, the order is paid.
-- (Older registrations without an order get their own thank-you is not possible; staff email them as before.)
create or replace function public.registrations_after_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is not null and not exists (
       select 1 from public.registrations r where r.order_id = new.order_id and not r.paid and not r.cancelled) then
    update public.orders set status = 'paid' where id = new.order_id and status <> 'paid';
  end if;
  return new;
end $$;
drop trigger if exists registrations_after_paid on public.registrations;
create trigger registrations_after_paid after update of paid on public.registrations
  for each row when (new.paid and not old.paid)
  execute function public.registrations_after_paid();

-- ---------------------------------------------------------------- Square notifications
-- Called by the square-webhook function (after it checks Square's signature).
create or replace function public.square_event(p_event jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  ev_id  text := p_event->>'event_id';
  ev     text := p_event->>'type';
  obj    jsonb := p_event->'data'->'object';
  pay    jsonb; inv jsonb; sub jsonb;
  o      public.orders;
  res    text := 'ignored';
  ref    text;
begin
  if ev_id is null then return 'no event id'; end if;
  insert into public.square_events (event_id, type, payload) values (ev_id, ev, p_event) on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  if ev in ('payment.created', 'payment.updated') then
    pay := obj->'payment';
    if pay->>'status' = 'COMPLETED' then
      ref := substring(coalesce(pay->>'note', '') from 'LLA order ([0-9a-f-]{36})');
      select * into o from public.orders
       where (square_order_id is not null and square_order_id = pay->>'order_id') or id::text = ref
       order by created_at desc limit 1;
      if found then
        if not (pay->>'id' = any (o.square_payment_ids)) then
          update public.orders set square_payment_ids = square_payment_ids || (pay->>'id'), status = 'paid' where id = o.id;
        end if;
        res := 'paid order ' || o.id;
      else
        res := 'payment not matched';
      end if;
    end if;

  elsif ev in ('subscription.created', 'subscription.updated') then
    sub := obj->'subscription';
    select * into o from public.orders where square_subscription_id = sub->>'id';
    if not found then
      -- New subscription from one of our monthly checkouts: newest pending order with that plan.
      select * into o from public.orders
       where square_subscription_id is null and plan = 'monthly' and square_plan_variation = sub->>'plan_variation_id'
         and status in ('pending', 'paid') and created_at > now() - interval '2 days'
       order by created_at desc limit 1;
      if found then
        -- Square only creates the subscription once the first payment succeeds.
        update public.orders set square_subscription_id = sub->>'id',
               status = case when sub->>'status' = 'ACTIVE' then 'paid' else status end where id = o.id;
        res := 'linked subscription to ' || o.id;
      else res := 'subscription not matched'; end if;
    else res := 'subscription known';
    end if;

  elsif ev = 'invoice.payment_made' then
    inv := obj->'invoice';
    select * into o from public.orders where square_subscription_id = inv->>'subscription_id';
    if found then
      -- payments_received = how many subscription invoices have been paid (idempotent).
      update public.orders set status = 'paid', payments_received = greatest(payments_received, (
        select count(*)::int from public.square_events e
        where e.type = 'invoice.payment_made' and e.payload->'data'->'object'->'invoice'->>'subscription_id' = inv->>'subscription_id'))
       where id = o.id;
      res := 'subscription payment for ' || o.id;
    else res := 'invoice not matched'; end if;

  elsif ev = 'invoice.scheduled_charge_failed' then
    inv := obj->'invoice';
    select * into o from public.orders where square_subscription_id = inv->>'subscription_id';
    perform send_email(lla_staff_emails(),
      'Monthly payment failed: ' || coalesce(o.parent_name, 'a family') || coalesce(' (' || lla_join(lla_order_children(o)) || ')', ''),
      lla_email_wrap('<p><strong>A monthly card payment didn''t go through.</strong> Square will show it under Invoices.</p>'
        || case when o.id is not null then '<p>' || lla_html(o.parent_name) || ' · ' || lla_html(o.email) || ' · ' || lla_html(o.phone) || '</p>' || lla_order_items_html(o, false) else '' end
        || '<p><strong>Draft reminder to send the family</strong> (review, then send from info@):</p>'
        || '<div style="border-left:3px solid #b8924a;padding:8px 14px;color:#1d2a44">'
        || '<p>Hi ' || lla_html(coalesce(split_part(trim(o.parent_name), ' ', 1), 'there')) || ',</p>'
        || '<p>We tried to process your monthly payment of ' || coalesce(lla_money(o.monthly_cents), 'your course') || ' for '
        || lla_html(coalesce(lla_join(lla_order_children(o)), 'your child')) || '''s course, but it didn''t go through. '
        || 'This can happen when a card expires or a bank declines the charge.</p>'
        || '<p>Could you check your card and reply to this email, or let us know if you''d like to pay another way? We''re happy to help.</p>'
        || '<p>Thank you,<br>Living Learning Academy</p></div>'),
      coalesce(o.email, 'info@livinglearningacademy.com'));
    res := 'failed charge alert sent';
  end if;

  update public.square_events set result = res where event_id = ev_id;
  return res;
end $$;
revoke all on function public.square_event(jsonb) from public, anon, authenticated;
grant execute on function public.square_event(jsonb) to service_role;

-- ---------------------------------------------------------------- old flow
-- Registrations that belong to an order get their family emails from the order (above),
-- so the per-registration parent email only goes out for the old one-course form.
-- (registrations_after_insert: parent email only when payment_choice = 'etransfer' AND order_id is null.)
-- Monthly plans from the new checkout end by themselves, so "time to cancel" is only for the old links.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.registrations_after_insert()'::regprocedure);
  if position('and new.order_id is null then' in d) = 0 then
    d := replace(d, E'  if new.payment_choice = ''etransfer'' then\n  perform send_email(',
                    E'  if new.payment_choice = ''etransfer'' and new.order_id is null then\n  perform send_email(');
    if position('and new.order_id is null then' in d) = 0 then raise exception 'registrations_after_insert not updated'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.send_cancel_reminders()'::regprocedure);
  if position('and order_id is null' in d) = 0 then
    d := replace(d, 'and cancel_reminder_sent_at is null', 'and cancel_reminder_sent_at is null and order_id is null');
    if position('and order_id is null' in d) = 0 then raise exception 'send_cancel_reminders not updated'; end if;
    execute d;
  end if;
end $do$;

-- ---------------------------------------------------------------- class address (sent in the paid thank-you)
alter table public.course_capacity add column if not exists unit text;  -- e.g. 'Building A, Unit 1'
update public.course_capacity set unit = case when course_id = 'music-theatre' then 'Building A, Unit 8' else 'Building A, Unit 1' end;
update public.locations set address = '20178 96, Langley Twp, BC V1M 0B2' where place = 'Langley, BC';
update public.course_capacity set course_name = 'LLA Young Entrepreneurs', ref_name = 'Young Entrepreneurs' where course_id = 'intro-entrepreneurship';

create or replace function public.lla_order_items_html(o public.orders, p_address boolean)
returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(
    '<div style="border:1px solid #eee7da;border-radius:8px;padding:12px 14px;margin:10px 0">'
    || '<strong>' || lla_html(x->>'name') || '</strong> · ' || lla_html(x->>'child')
    || coalesce('<br><span style="color:#6b7280">When:</span> ' || lla_html(x->>'schedule'), '')
    || coalesce('<br><span style="color:#6b7280">Where:</span> ' || case
         when p_address and l.address is not null then lla_html(coalesce(c.unit || ', ', '') || l.address) || coalesce('<br><span style="color:#6b7280">' || lla_html(l.notes) || '</span>', '')
         when p_address then lla_html(x->>'place') || ' (we''ll email the exact address before the first class)'
         else lla_html(x->>'place') end, '')
    || '</div>', '' order by ord), '')
  from jsonb_array_elements(o.items) with ordinality as t(x, ord)
  left join public.locations l on l.place = x->>'place'
  left join public.course_capacity c on c.course_id = x->>'course_id';
$$;
