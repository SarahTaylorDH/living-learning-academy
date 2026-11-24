-- New programs on the interest lists: Dance & Character, Film, Television & Character, Journalism, Media & Character.
-- ('music-dance' stays as the key for Music Theatre & Character, so earlier sign-ups keep their answer.)
alter table public.submissions
  drop constraint if exists skills_allowed,
  drop constraint if exists interests_allowed,
  drop constraint if exists requested_allowed,
  add constraint skills_allowed check (skills <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','fitness-character','other']),
  add constraint interests_allowed check (interests <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','fitness-character','other']),
  add constraint requested_allowed check (requested <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','fitness-character','other']);
alter table public.submission_children
  drop constraint if exists child_interests_allowed,
  add constraint child_interests_allowed check (interests <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','fitness-character','other']);
alter table public.survey_responses
  drop constraint if exists survey_topics_allowed,
  add constraint survey_topics_allowed check (topics <@ array['critical-thinking-debate','finance-entrepreneurship','public-speaking','impact-community','faith-freedom','culture-identity','civics-citizenship','creative-arts-media','survival-nature','farming-food','build-serve','self-defence','music-dance','dance-character','film-television','journalism-media','beauty-character','etiquette-character','fitness-character']);
