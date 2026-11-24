-- Parent / student survey. Answers are saved here, in their own table. No names of children or health details are collected.
-- Safe to run more than once.
create table if not exists public.survey_responses (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  respondent       text not null check (respondent in ('parent','student')),
  student_ok       boolean not null default false,
  ages             text[] not null default '{}',
  schooling        text[] not null default '{}',
  topics           text[] not null default '{}',
  formats          text[] not null default '{}',
  days             text[] not null default '{}',
  budget           text check (budget is null or budget in ('under-150','150-250','250-350','350-plus','unsure')),
  how_heard        text check (how_heard is null or how_heard in ('friend','church','social','search','school','event','other')),
  learn_wish       text check (learn_wish is null or char_length(learn_wish) <= 2000),
  concerns         text check (concerns is null or char_length(concerns) <= 2000),
  first_name       text check (first_name is null or char_length(first_name) <= 60),
  email            text check (email is null or (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')),
  city             text check (city is null or char_length(city) <= 120),
  province         text check (province is null or province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT','OUTSIDE')),
  wants_follow_up  boolean not null default false,
  privacy_consent  boolean not null check (privacy_consent = true),
  consent_version  text not null check (char_length(consent_version) between 1 and 20),
  source           text check (source is null or char_length(source) <= 40),
  staff_notes      text,
  constraint survey_student_needs_ok check (respondent <> 'student' or student_ok),
  constraint survey_follow_up_needs_email check (not wants_follow_up or email is not null),
  constraint survey_ages_allowed check (ages <@ array['6-8','9-11','12-14','15-18']),
  constraint survey_schooling_allowed check (schooling <@ array['public','homeschool','private','alternative']),
  constraint survey_formats_allowed check (formats <@ array['in-person','online','hands-on']),
  constraint survey_days_allowed check (days <@ array['weekdays','evenings','weekends','occasional']),
  constraint survey_topics_allowed check (topics <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','firearm-safety','fitness-character'])
);

alter table public.survey_responses enable row level security;
revoke all on public.survey_responses from anon, authenticated;
grant insert (id, respondent, student_ok, ages, schooling, topics, formats, days, budget, how_heard, learn_wish, concerns,
              first_name, email, city, province, wants_follow_up, privacy_consent, consent_version, source)
  on public.survey_responses to anon;
drop policy if exists "website can add survey answers" on public.survey_responses;
create policy "website can add survey answers" on public.survey_responses
  for insert to anon with check (privacy_consent = true);
