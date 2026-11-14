-- Living Learning Academy: course registrations from /register/, with live spot counts.
--
-- How spots work
--   * Each course has a capacity (15) in public.course_capacity.
--   * A registration takes a spot while it is PAID, or while its hold has not run out:
--       e-Transfer: held 12 hours.   Card (Square): held 1 hour while they pay.
--   * When a hold runs out unpaid, the spot frees up automatically for the next family.
--   * Staff: when money arrives, set paid = true. To release a spot, set cancelled = true.
--   * The website shows "spots left" and "Full" from course_availability(), and the database
--     refuses a new registration once a course is full.
-- The public site can only INSERT registrations and read the spot counts (no names or details).

create table if not exists public.course_capacity (
  course_id text primary key,
  course_name text not null,
  capacity int not null default 15 check (capacity between 0 and 100)
);
insert into public.course_capacity (course_id, course_name) values
  ('music-theatre', 'LLA Music Theatre & Character'),
  ('truth-hunters', 'LLA Truth Hunters'),
  ('intro-entrepreneurship', 'LLA Intro to Entrepreneurship'),
  ('kidpreneurs', 'LLA Kidpreneurs'),
  ('critical-thinking-debate', 'LLA Critical Thinking & Debate')
on conflict (course_id) do nothing;
alter table public.course_capacity enable row level security;
revoke all on public.course_capacity from anon, authenticated;

create table if not exists public.registrations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  course_id         text not null references public.course_capacity (course_id),
  course_name       text not null check (char_length(course_name) <= 120),
  parent_name       text not null check (char_length(parent_name) between 1 and 120),
  email             text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  phone             text not null check (char_length(phone) between 10 and 40),
  street_address    text not null check (char_length(street_address) between 1 and 200),
  city              text not null check (char_length(city) between 1 and 100),
  province          text not null check (char_length(province) between 1 and 60),
  postal_code       text not null check (char_length(postal_code) between 6 and 7),
  child_first_name  text not null check (char_length(child_first_name) between 1 and 80),
  child_last_name   text not null check (char_length(child_last_name) between 1 and 80),
  child_age         int  not null check (child_age between 5 and 18),
  child_gender      text not null check (child_gender in ('male', 'female')),
  payment_choice    text not null check (payment_choice in ('etransfer', 'square')),
  policy_ack        boolean not null check (policy_ack),
  payment_reference text check (char_length(payment_reference) <= 120),
  source            text check (char_length(source) <= 40),
  -- Set by the database / staff:
  hold_expires_at   timestamptz not null default now(),
  paid              boolean not null default false,
  cancelled         boolean not null default false,
  released_at       timestamptz,          -- set automatically when an unpaid hold runs out
  staff_notes       text
);
create index if not exists registrations_course_idx on public.registrations (course_id);

alter table public.registrations enable row level security;
drop policy if exists "public can register" on public.registrations;
create policy "public can register" on public.registrations
  for insert to anon
  with check (paid = false and cancelled = false and released_at is null and staff_notes is null);
revoke select, update, delete on public.registrations from anon, authenticated;
grant insert on public.registrations to anon;

-- Spots taken = paid, or still inside the hold window, and not cancelled.
create or replace function public.spots_taken(p_course text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.registrations
  where course_id = p_course and not cancelled and (paid or hold_expires_at > now());
$$;
revoke all on function public.spots_taken(text) from public, anon, authenticated;

-- Before each new registration: set the hold, and refuse it if the course is full.
create or replace function public.registrations_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int;
begin
  -- Lock the course row so two families can't take the last spot at the same moment.
  select capacity into cap from public.course_capacity where course_id = new.course_id for update;
  if cap is null then raise exception 'unknown_course'; end if;
  if public.spots_taken(new.course_id) >= cap then
    raise exception 'course_full' using errcode = 'P0001', hint = 'This course is full.';
  end if;
  new.created_at := now();
  new.hold_expires_at := now() + case when new.payment_choice = 'etransfer' then interval '12 hours' else interval '1 hour' end;
  return new;
end $$;
drop trigger if exists registrations_before_insert on public.registrations;
create trigger registrations_before_insert before insert on public.registrations
  for each row execute function public.registrations_before_insert();

-- Public spot counts for the website (numbers only, no personal details).
create or replace function public.course_availability()
returns table (course_id text, capacity int, taken int, spots_left int)
language sql stable security definer set search_path = public as $$
  select c.course_id, c.capacity, public.spots_taken(c.course_id),
         greatest(c.capacity - public.spots_taken(c.course_id), 0)
  from public.course_capacity c;
$$;
revoke all on function public.course_availability() from public, authenticated;
grant execute on function public.course_availability() to anon;

-- Released spots: every 10 minutes, mark unpaid holds that have run out.
-- Marking a row (an UPDATE) is what triggers the "spot released" email alert
-- (Database Webhook on UPDATE -> Edge Function registration-alerts; see docs/REGISTRATIONS.md).
create or replace function public.release_expired_holds()
returns int language sql security definer set search_path = public as $$
  with r as (
    update public.registrations set released_at = now()
    where not paid and not cancelled and released_at is null and hold_expires_at <= now()
    returning 1
  ) select count(*)::int from r;
$$;
revoke all on function public.release_expired_holds() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'lla-release-expired-holds';
select cron.schedule('lla-release-expired-holds', '*/10 * * * *', 'select public.release_expired_holds();');

-- Staff views (not visible to the public).
create or replace view public.registrations_released as
  select released_at, payment_choice, course_name, parent_name, email, phone,
         child_first_name, child_last_name, payment_reference, created_at, id
  from public.registrations
  where released_at is not null and not paid
  order by released_at desc;
revoke all on public.registrations_released from anon, authenticated;

create or replace view public.registrations_open_holds as
  select created_at, hold_expires_at, payment_choice, course_name, parent_name, email, phone,
         child_first_name, child_last_name, payment_reference, id
  from public.registrations
  where not paid and not cancelled and hold_expires_at > now()
  order by hold_expires_at;
create or replace view public.registrations_expired_holds as
  select created_at, hold_expires_at, payment_choice, course_name, parent_name, email, phone,
         child_first_name, child_last_name, payment_reference, id
  from public.registrations
  where not paid and not cancelled and hold_expires_at <= now()
  order by hold_expires_at desc;
revoke all on public.registrations_open_holds, public.registrations_expired_holds from anon, authenticated;
