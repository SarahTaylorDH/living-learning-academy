-- Family discount: 10% off each additional course in the same household, per term.
-- A household = same email AND same phone number. Resets each term (registrations.term).
alter table public.registrations
  add column if not exists term text not null default 'winter-2027' check (char_length(term) <= 40),
  add column if not exists family_discount boolean not null default false;

create or replace function public.household_key(p_email text, p_phone text)
returns text language sql immutable as $$
  select lower(trim(coalesce(p_email, ''))) || '|' || right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- For the website: "has this household already registered this term?" (yes/no only, no details).
create or replace function public.household_registered(p_email text, p_phone text, p_term text default 'winter-2027')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registrations r
    where r.term = p_term and not r.cancelled and r.released_at is null
      and public.household_key(r.email, r.phone) = public.household_key(p_email, p_phone)
  );
$$;
revoke all on function public.household_registered(text, text, text) from public, authenticated;
grant execute on function public.household_registered(text, text, text) to anon;

-- Before each new registration: set the hold, refuse it if the course is full,
-- and mark the family discount (decided here, not by the browser).
-- Card holds last 24 hours (was 1 hour) so a paid family never loses its spot before staff mark it paid.
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
  new.hold_expires_at := now() + case when new.payment_choice = 'etransfer' then interval '12 hours' else interval '24 hours' end;
  new.family_discount := public.household_registered(new.email, new.phone, new.term);
  return new;
end $$;
