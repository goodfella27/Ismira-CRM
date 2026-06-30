-- Ensures legacy Breezy boilerplate ("Last updated" + general application link) never persists in cache again.
-- Run once in Supabase SQL editor.

create or replace function public.scrub_breezy_description(raw text)
returns text
language sql
immutable
as $$
  with input as (select coalesce(raw, '') as value),
  step1 as (
    select regexp_replace(value, '<p[^>]*>\\s*Last updated:\\s*[\\s\\S]*?<\\/p>', '', 'gi') as value
    from input
  ),
  step2 as (
    select regexp_replace(value, 'Last updated:\\s*[^<\\n]+', '', 'gi') as value
    from step1
  ),
  step3 as (
    select regexp_replace(value, '<p[^>]*>\\s*You can submit your Resume[\\s\\S]*?<\\/p>', '', 'gi') as value
    from step2
  ),
  step4 as (
    select regexp_replace(value, '<p[^>]*>\\s*If you are not sure what position to apply for[\\s\\S]*?<\\/p>', '', 'gi') as value
    from step3
  ),
  step5 as (
    select regexp_replace(value, 'https?:\\/\\/ismira\\.breezy\\.hr\\/p\\/[a-z0-9-]*general-application[^\\s<\"]*', '', 'gi') as value
    from step4
  ),
  step6 as (
    select regexp_replace(value, '<p[^>]*>\\s*<\\/p>', '', 'gi') as value
    from step5
  )
  select btrim(value) from step6;
$$;

create or replace function public.scrub_breezy_position_details(details jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  next_details jsonb := details;
  key text;
  raw text;
  scrubbed text;
begin
  if details is null then
    return details;
  end if;

  foreach key in array array['description','job_description','jobDescription','content','html']
  loop
    raw := next_details ->> key;
    if raw is null or btrim(raw) = '' then
      continue;
    end if;
    scrubbed := public.scrub_breezy_description(raw);
    if scrubbed is distinct from raw then
      next_details := jsonb_set(next_details, array[key], to_jsonb(scrubbed), true);
    end if;
  end loop;

  return next_details;
end;
$$;

create or replace function public.breezy_positions_scrub_details_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.details is not null then
    new.details := public.scrub_breezy_position_details(new.details);
  end if;
  return new;
end;
$$;

drop trigger if exists breezy_positions_scrub_details on public.breezy_positions;
create trigger breezy_positions_scrub_details
before insert or update of details on public.breezy_positions
for each row
execute function public.breezy_positions_scrub_details_trigger();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;

notify pgrst, 'reload schema';
