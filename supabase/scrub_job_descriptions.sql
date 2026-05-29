-- One-time cleanup for already-cached Breezy position descriptions.
-- Removes the legacy "Last updated" + general application link boilerplate from breezy_positions.details.

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

-- Updates multiple possible keys where Breezy stores the description HTML.
update public.breezy_positions
set details =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            details,
            '{description}',
            to_jsonb(public.scrub_breezy_description(details->>'description')),
            true
          ),
          '{job_description}',
          to_jsonb(public.scrub_breezy_description(details->>'job_description')),
          true
        ),
        '{jobDescription}',
        to_jsonb(public.scrub_breezy_description(details->>'jobDescription')),
        true
      ),
      '{content}',
      to_jsonb(public.scrub_breezy_description(details->>'content')),
      true
    ),
    '{html}',
    to_jsonb(public.scrub_breezy_description(details->>'html')),
    true
  )
where details is not null
  and (
    (details->>'description') ilike '%Last updated:%'
    or (details->>'job_description') ilike '%Last updated:%'
    or (details->>'jobDescription') ilike '%Last updated:%'
    or (details->>'content') ilike '%Last updated:%'
    or (details->>'html') ilike '%Last updated:%'
    or (details->>'description') ilike '%ismira.breezy.hr/p/%general-application%'
    or (details->>'job_description') ilike '%ismira.breezy.hr/p/%general-application%'
    or (details->>'jobDescription') ilike '%ismira.breezy.hr/p/%general-application%'
    or (details->>'content') ilike '%ismira.breezy.hr/p/%general-application%'
    or (details->>'html') ilike '%ismira.breezy.hr/p/%general-application%'
  );

-- Optional: drop the helper after you confirm the data looks right.
-- drop function public.scrub_breezy_description(text);
