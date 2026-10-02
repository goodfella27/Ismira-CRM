-- Headings belong to stable opening types, independent of portal filter visibility.
alter table public.breezy_priority_types
  add column if not exists website_title text not null default '';

alter table public.breezy_priority_types
  add constraint breezy_priority_types_website_title_length
  check (char_length(website_title) <= 200);
