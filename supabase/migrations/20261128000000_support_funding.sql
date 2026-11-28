-- Support needs and funding (Phase 1), from /register/.
--
-- A family can tick "My child has a disability or additional support needs" on the payment step,
-- answer a few short questions, and say how they'll pay:
--   * Self-pay: they pay by card or e-Transfer as usual. support@ gets the support details.
--   * Funding (OL school, Autism Funding or other funding): no payment is taken.
--     The order is saved with method = 'funding', the spot is HELD, and support@ is alerted to call.
--
-- How a funding hold works (staff do steps 2 and 3 in Supabase > Table Editor > orders):
--   1. Family submits: the spot is held for up to 7 days while LLA reaches out.
--   2. Staff try to reach the family: set contact_attempted_at (e.g. now()).
--      The hold then ends 48 hours after that first try.
--   3. The family replies: set family_replied_at. The hold is extended to 30 days from then,
--      while funding is arranged.
--   4. Funding approved (or the family pays the bridge): set status = 'paid'.
--      The family gets a "you're all set" email with the address.
--   If the hold runs out, the spot is released and the family gets one email saying so,
--   with support@ to contact if they still want to join.

-- ---------------------------------------------------------------- allow the new payment choice
alter table public.registrations drop constraint if exists registrations_payment_choice_check;
alter table public.registrations add constraint registrations_payment_choice_check
  check (payment_choice in ('etransfer', 'square', 'funding'));
alter table public.orders drop constraint if exists orders_method_check;
alter table public.orders add constraint orders_method_check
  check (method in ('card', 'etransfer', 'funding'));

-- ---------------------------------------------------------------- support details (staff only: orders has no public access)
alter table public.orders
  add column if not exists support_needs        boolean not null default false,
  add column if not exists funding_source       text check (funding_source in ('self-pay', 'ol-school', 'autism-funding', 'other')),
  add column if not exists support_types        text[] check (support_types <@ array['autism','adhd','learning','developmental','physical','sensory-communication','behavioural-emotional','other']),
  add column if not exists ol_school            text check (char_length(ol_school) <= 120),
  add column if not exists support_notes        text check (char_length(support_notes) <= 600),
  add column if not exists best_contact         text check (char_length(best_contact) <= 200),
  add column if not exists contact_attempted_at timestamptz,
  add column if not exists family_replied_at    timestamptz,
  add column if not exists release_email_sent_at timestamptz;

create or replace function public.lla_support_emails()
returns text[] language sql immutable as $$
  select array['support@livinglearningacademy.com'];
$$;

create or replace function public.lla_support_types_label(p text[])
returns text language sql immutable as $$
  select coalesce(nullif(array_to_string(array(select case x
    when 'autism' then 'Autism (ASD)' when 'adhd' then 'ADHD or attention'
    when 'learning' then 'Learning disability' when 'developmental' then 'Developmental or intellectual disability'
    when 'physical' then 'Physical disability or mobility' when 'sensory-communication' then 'Hearing, vision or communication'
    when 'behavioural-emotional' then 'Behavioural, social or emotional' when 'other' then 'Other' else x end
    from unnest(p) x), ', '), ''), '(not given)');
$$;

-- Funding emails: what the course(s) the child is registered in can do for them (no worldview wording).
create or replace function public.lla_funding_course_text(o public.orders)
returns text language sql stable set search_path = public as $$
  select '<p>In <strong>' || lla_html(lla_join(array(select distinct x->>'name' from jsonb_array_elements(o.items) x))) || '</strong>, '
    || lla_html(lla_join(lla_order_children(o))) || ' will practise real-world life skills in a small, hands-on group alongside peers. '
    || case when (select count(distinct x->>'name') from jsonb_array_elements(o.items) x) > 1
         then 'These courses build social and communication skills in a group setting, and support and enrich learning in <strong>Applied Design, Skills and Technologies (ADST)</strong> and <strong>Career Education</strong>. They can also'
         else 'The course builds social and communication skills in a group setting, and supports and enriches learning in <strong>Applied Design, Skills and Technologies (ADST)</strong> and <strong>Career Education</strong>. It can also' end
    || ' support your child''s IEP goals, with optional extra support in class.</p>';
$$;

create or replace function public.lla_funding_label(p text)
returns text language sql immutable as $$
  select case p
    when 'self-pay' then 'Paying themselves'
    when 'ol-school' then 'OL school learning funds'
    when 'autism-funding' then 'Autism Funding'
    when 'other' then 'Other funding'
    else coalesce(p, '(not given)') end;
$$;

-- ---------------------------------------------------------------- holds
-- Same as before, plus: funding holds start at 7 days (shortened to 48 hours once staff first try to reach them).
create or replace function public.registrations_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  select capacity into cap from public.course_capacity where course_id = new.course_id for update;
  if cap is null then raise exception 'unknown_course'; end if;
  if public.spots_taken(new.course_id) >= cap then
    raise exception 'course_full' using errcode = 'P0001', hint = 'This course is full.';
  end if;
  new.created_at := now();
  new.hold_expires_at := now() + case new.payment_choice
    when 'etransfer' then interval '12 hours'
    when 'funding' then interval '7 days'
    else interval '24 hours' end;
  new.family_discount := public.household_registered(new.email, new.phone, new.term);
  return new;
end $$;

-- Staff set contact_attempted_at / family_replied_at on a funding order: move its holds.
create or replace function public.orders_support_hold()
returns trigger language plpgsql security definer set search_path = public as $$
declare until_at timestamptz;
begin
  if new.method <> 'funding' or new.status <> 'pending' then return new; end if;
  if new.family_replied_at is not null and old.family_replied_at is null then
    until_at := new.family_replied_at + interval '30 days';
  elsif new.contact_attempted_at is not null and old.contact_attempted_at is null and new.family_replied_at is null then
    until_at := new.contact_attempted_at + interval '48 hours';
  else
    return new;
  end if;
  update public.registrations set hold_expires_at = until_at
   where order_id = new.id and not paid and not cancelled and released_at is null;
  return new;
end $$;
drop trigger if exists orders_support_hold on public.orders;
create trigger orders_support_hold after update of contact_attempted_at, family_replied_at on public.orders
  for each row execute function public.orders_support_hold();

-- ---------------------------------------------------------------- payment summary (staff alerts)
create or replace function public.lla_payment_text(r public.registrations)
returns text language sql stable set search_path = public as $$
  select case
    when o.id is not null and o.method = 'funding' then
      'Funding: ' || lla_funding_label(o.funding_source) || ' (no payment taken; support@ will contact the family), '
      || lla_money(o.total_cents) || ' for the full term'
      || case when jsonb_array_length(o.items) > 1 then ' (order of ' || jsonb_array_length(o.items) || ' courses)' else '' end
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
-- Same as before, plus: method 'funding', and the support details in p->'support'.
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f        jsonb := p->'family';
  s        jsonb := p->'support';
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
  v_support boolean := coalesce((p->'support'->>'needs')::boolean, false);
  v_source text := nullif(trim(coalesce(p->'support'->>'funding_source', '')), '');
begin
  if meth is null or meth not in ('card', 'etransfer', 'funding') then raise exception 'bad_method'; end if;
  if pl not in ('full', 'monthly') then raise exception 'bad_plan'; end if;
  if pl = 'monthly' and meth <> 'card' then raise exception 'monthly_is_card_only'; end if;
  if meth = 'funding' then
    if not v_support then raise exception 'funding_needs_support_details'; end if;
    if v_source is null or v_source not in ('ol-school', 'autism-funding', 'other') then raise exception 'bad_funding_source'; end if;
  end if;
  if v_support then
    if v_source is null or v_source not in ('self-pay', 'ol-school', 'autism-funding', 'other') then raise exception 'bad_funding_source'; end if;
    if jsonb_typeof(s->'types') is distinct from 'array' or jsonb_array_length(s->'types') = 0 then raise exception 'support_types_required'; end if;
    if char_length(trim(coalesce(s->>'best_contact', ''))) < 3 then raise exception 'best_contact_required'; end if;
  end if;
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

  insert into public.orders (id, parent_name, email, phone, method, plan, etransfer_from, referred_by, source,
                             support_needs, funding_source, support_types, ol_school, support_notes, best_contact)
  values (oid, left(f->>'parent_name', 120), left(f->>'email', 200), left(f->>'phone', 40), meth, pl,
          case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
          nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40),
          v_support, case when v_support then v_source end,
          case when v_support then array(select jsonb_array_elements_text(s->'types')) end,
          case when v_support then nullif(left(trim(coalesce(s->>'ol_school', '')), 120), '') end,
          case when v_support then nullif(left(trim(coalesce(s->>'notes', '')), 600), '') end,
          case when v_support then left(trim(s->>'best_contact'), 200) end);

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
        case meth when 'etransfer' then 'etransfer' when 'funding' then 'funding' else 'square' end, pl, true,
        case when meth = 'etransfer' then left(coalesce(nullif(trim(p->>'etransfer_from'), ''), f->>'email'), 200) end,
        nullif(left(trim(coalesce(p->>'referred_by', '')), 120), ''), left(p->>'source', 40), oid, c.place, c.schedule)
      returning * into reg;
    exception when raise_exception then
      if sqlerrm = 'course_full' then raise exception 'course_full:%', c.course_id; end if;
      raise;
    end;
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
  if v_support then perform lla_send_support_received(oid); end if;

  return jsonb_build_object('order_id', oid, 'method', meth, 'plan', pl, 'total_cents', v_total,
    'monthly_cents', per_mo, 'months', mos, 'items', v_items, 'etransfer_message', msg,
    'etransfer_to', 'payments@livinglearningacademy.com', 'email', f->>'email');
end $$;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to service_role;

-- ---------------------------------------------------------------- emails
-- New support-needs order: alert support@ (every time), and for funding orders, a thank-you to the family.
create or replace function public.lla_send_support_received(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; row text;
begin
  select * into o from public.orders where id = p_order;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  row := '<tr><td style="padding:3px 14px 3px 0;color:#6b7280;vertical-align:top">';

  perform send_email(lla_support_emails(),
    'Support intake needed: ' || lla_join(kids) || ' (' || lla_funding_label(o.funding_source) || ')',
    lla_email_wrap(
      '<p><strong>A family registered with a disability or additional support needs.</strong> Please contact them at the time they chose.</p>'
      || '<table style="border-collapse:collapse">'
      || row || 'Parent</td><td>' || lla_html(o.parent_name) || '</td></tr>'
      || row || 'Email</td><td>' || lla_html(o.email) || '</td></tr>'
      || row || 'Phone</td><td>' || lla_html(o.phone) || '</td></tr>'
      || row || 'Best way and time</td><td><strong>' || lla_html(o.best_contact) || '</strong></td></tr>'
      || row || 'Type of support need</td><td><strong>' || lla_html(lla_support_types_label(o.support_types)) || '</strong></td></tr>'
      || row || 'Paying by</td><td>' || lla_html(lla_funding_label(o.funding_source)) || case when o.ol_school is not null then ' · ' || lla_html(o.ol_school) else '' end || '</td></tr>'
      || row || 'What helps their child</td><td>' || coalesce(nullif(lla_html(o.support_notes), ''), '(not given)') || '</td></tr>'
      || '</table>'
      || lla_order_items_html(o, false)
      || case when o.method = 'funding' then
           '<p><strong>Spot held, no payment taken.</strong> After your first call, text or email, set <em>contact_attempted_at</em> on this order in Supabase: '
           || 'the hold then ends 48 hours later unless they reply. When they reply, set <em>family_replied_at</em> (holds 30 more days). '
           || 'When funding is approved or the family pays, set <em>status</em> to <em>paid</em>.</p>'
         else '<p>This family is paying themselves (' || case o.method when 'etransfer' then 'e-Transfer' else 'card' end || '), so their payment hold works as usual.</p>' end
      || '<p style="color:#6b7280;font-size:13px">Order ' || o.id || '</p>'),
    o.email);

  if o.method = 'funding' then
    perform send_email(array[o.email],
      'We''ve received ' || case when one then (o.items->0->>'child') || '''s registration for ' || (o.items->0->>'name') else 'your registration for ' || lla_join(kids) end,
      lla_email_wrap(
        '<p>Hi ' || lla_html(split_part(trim(o.parent_name), ' ', 1)) || ',</p>'
        || '<p>Thank you for registering ' || lla_html(lla_join(kids)) || ' with Living Learning Academy! We''re glad you''re here.</p>'
        || lla_order_items_html(o, false)
        || lla_funding_course_text(o)
        || '<p>Because you told us your child has a disability or additional support needs, someone from our support team will contact you '
        || '(you asked: <strong>' || lla_html(o.best_contact) || '</strong>) to:</p>'
        || '<ul style="padding-left:20px">'
        || '<li>talk about what helps your child do well, including whether a support worker would help in class'
        || case when 'autism' = any(coalesce(o.support_types, '{}')) or o.funding_source = 'autism-funding'
                then ' and how we can best support autistic learners' else '' end || '</li>'
        || '<li>connect the course to your child''s IEP goals, if they have an IEP</li>'
        || '<li>help you with the next steps for ' || lla_html(lla_funding_label(o.funding_source)) || '</li></ul>'
        || case o.funding_source
             when 'ol-school' then '<p><strong>Helpful next step:</strong> let your OL teacher know you''d like to use your child''s learning funds for this course, as schools approve providers before services begin. If your teacher asks for anything from us, just let us know.</p>'
             when 'autism-funding' then '<p><strong>Helpful next step:</strong> Autism Funding asks families to authorize a provider before services begin. We''ll walk you through it when we talk.</p>'
             else '' end
        || '<p><strong>' || case when one then 'Your spot is' else 'Your spots are' end || ' held while we connect.</strong> '
        || 'If we can''t reach you within 48 hours of our first try, the spot will be released. You can always email '
        || '<a href="mailto:support@livinglearningacademy.com">support@livinglearningacademy.com</a> to set up a call and rejoin if spots are still available.</p>'
        || '<p>Warmly,<br>The LLA Support Team</p>'),
      'support@livinglearningacademy.com');
  end if;
exception when others then
  raise warning 'support emails failed: %', sqlerrm;  -- never block a registration because of email
end $$;
revoke all on function public.lla_send_support_received(uuid) from public, anon, authenticated;

-- A funding order's spots were all released: one email to the family (and a copy to support@).
create or replace function public.orders_after_support_release()
returns trigger language plpgsql security definer set search_path = public as $$
declare kids text[];
begin
  if new.method <> 'funding' or new.release_email_sent_at is not null then return new; end if;
  kids := lla_order_children(new);
  perform send_email(array[new.email],
    case when jsonb_array_length(new.items) = 1 then 'Your spot for ' || (new.items->0->>'name') || ' has been released'
         else 'Your spots for ' || lla_join(kids) || ' have been released' end,
    lla_email_wrap(
      '<p>Hi ' || lla_html(split_part(trim(new.parent_name), ' ', 1)) || ',</p>'
      || '<p>We tried to reach you about ' || lla_html(lla_join(kids)) || '''s registration but didn''t hear back, so we''ve released the '
      || case when jsonb_array_length(new.items) = 1 then 'spot' else 'spots' end || ' we were holding.</p>'
      || lla_order_items_html(new, false)
      || '<p>If you''d still like to join, just reply to this email or contact '
      || '<a href="mailto:support@livinglearningacademy.com">support@livinglearningacademy.com</a>, and we''ll help you rejoin if spots are still available.</p>'
      || '<p>Warmly,<br>The LLA Support Team</p>'),
    'support@livinglearningacademy.com');
  perform send_email(lla_support_emails(),
    'Funding hold released: ' || lla_join(kids),
    lla_email_wrap('<p>The hold ran out for ' || lla_html(new.parent_name) || ' · ' || lla_html(new.email) || ' · ' || lla_html(new.phone)
      || ', and the family has been told. If they did reply, set status back to pending, clear released_at on their registrations, and set family_replied_at.</p>'
      || lla_order_items_html(new, false)),
    new.email);
  update public.orders set release_email_sent_at = now() where id = new.id;
  return new;
exception when others then
  raise warning 'support release email failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists orders_after_support_release on public.orders;
create trigger orders_after_support_release after update of status on public.orders
  for each row when (new.status = 'released' and old.status is distinct from 'released')
  execute function public.orders_after_support_release();

-- Confirmed (status set to paid): the "you're all set" email, with wording for funding orders.
create or replace function public.lla_send_thank_you(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; pay text;
begin
  select * into o from public.orders where id = p_order;
  if o.thank_you_sent_at is not null then return; end if;
  kids := lla_order_children(o);
  one := jsonb_array_length(o.items) = 1;
  pay := case
    when o.method = 'funding' then 'Payment: through ' || lla_html(lla_funding_label(o.funding_source))
      || case when o.ol_school is not null then ' (' || lla_html(o.ol_school) || ')' else '' end || ', as arranged with our support team. '
      || 'Before the first class, we''ll make sure your child''s mentor and support worker know what helps your child do well.'
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
      || '<p>Thank you! ' || case when o.method = 'funding' then 'Your registration is confirmed' else 'Your payment is in' end
      || ', and ' || lla_html(lla_join(kids)) || ' '
      || case when array_length(kids, 1) > 1 then 'are' else 'is' end || ' all set.</p>'
      || lla_order_items_html(o, true)
      || case when o.method = 'funding' then lla_funding_course_text(o) else '' end
      || '<p>' || pay || '</p>'
      || '<p>Our mentors look forward to helping ' || lla_html(lla_join(kids)) || ' build confidence, character and real-world skills!</p>'
      || '<p><strong>Know a family who would love LLA?</strong> When they register and add your name, you get $20 off.</p>'
      || '<p>Questions? Just reply to this email.</p>'),
    case when o.method = 'funding' then 'support@livinglearningacademy.com' else 'info@livinglearningacademy.com' end);
  update public.orders set thank_you_sent_at = now() where id = o.id;
end $$;
revoke all on function public.lla_send_thank_you(uuid) from public, anon, authenticated;

-- Staff views: support-needs orders still in progress, newest first.
create or replace view public.support_intake as
  select o.created_at, o.status, o.method, lla_support_types_label(o.support_types) as support_type,
         lla_funding_label(o.funding_source) as paying_by, o.ol_school,
         o.parent_name, o.email, o.phone, o.best_contact, o.support_notes,
         lla_join(lla_order_children(o)) as children,
         (select string_agg(x->>'name', ', ') from jsonb_array_elements(o.items) x) as courses,
         o.contact_attempted_at, o.family_replied_at,
         (select min(r.hold_expires_at) from public.registrations r where r.order_id = o.id and not r.paid and not r.cancelled and r.released_at is null) as hold_until,
         o.id
  from public.orders o
  where o.support_needs and o.status in ('pending', 'paid', 'released')
  order by o.created_at desc;
revoke all on public.support_intake from anon, authenticated;

-- Status set to paid: same as before, with staff wording for funding orders.
create or replace function public.orders_after_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.registrations set paid = true, cancelled = false, released_at = null where order_id = new.id and not paid;
  perform lla_send_thank_you(new.id);
  perform send_email(case when new.method = 'funding' then lla_staff_emails() || lla_support_emails() else lla_staff_emails() end,
    case when new.method = 'funding' then 'Confirmed (funding): ' || lla_join(lla_order_children(new))
         else 'Paid: ' || lla_join(lla_order_children(new)) || ' (' || lla_money(case when new.plan = 'monthly' then new.monthly_cents else new.total_cents end)
           || case when new.plan = 'monthly' then ' first monthly payment' else '' end || ')' end,
    lla_email_wrap('<p><strong>' || case when new.method = 'funding' then 'Registration confirmed' else 'Payment received' end || '</strong> from '
      || lla_html(new.parent_name) || ' · ' || lla_html(new.email) || ' · ' || lla_html(new.phone) || '</p>'
      || lla_order_items_html(new, false)
      || '<p>' || case
           when new.method = 'funding' then 'Funding: ' || lla_html(lla_funding_label(new.funding_source)) || case when new.ol_school is not null then ' (' || lla_html(new.ol_school) || ')' else '' end
             || ', ' || lla_money(new.total_cents) || ' for the full term. Invoice the funder (or the family, for OL schools that need it) per the support plan.'
           else case new.method when 'etransfer' then 'e-Transfer' else 'Card' end || ', '
             || case when new.plan = 'monthly' then lla_money(new.monthly_cents) || ' a month for ' || new.months || ' months (ends by itself)'
                     else 'paid in full: ' || lla_money(new.total_cents) end end
      || '. The "you''re all set" email with the address has gone to the family.</p>'),
    new.email);
  return new;
exception when others then
  raise warning 'order paid handling failed: %', sqlerrm;
  return new;
end $$;


-- Fix: the 10-minute reminder job stopped with "column reference o.status is ambiguous"
-- (the loop variable o had the same name as the table alias), so no reminders were sent and
-- fully released orders were never marked released. Same function, alias renamed.
create or replace function public.send_checkout_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare o public.orders; kids text[]; one boolean; hold timestamptz; n int := 0;
begin
  -- Orders whose every spot was released are over.
  update public.orders ord set status = 'released'
   where ord.status = 'pending' and not exists (
     select 1 from public.registrations r where r.order_id = ord.id and r.released_at is null and not r.cancelled);
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
revoke all on function public.send_checkout_reminders() from public, anon, authenticated;
