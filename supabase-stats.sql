-- Run this in the Supabase SQL editor.
-- The application uses SUPABASE_SERVICE_ROLE_KEY server-side, so it can write
-- while this table remains inaccessible to the public anon role.

create table if not exists public.classified_stories (
  snapshot_date date not null,
  hn_item_id text not null,
  is_ai boolean not null,
  classifier_version text not null default 'v1',
  created_at timestamptz not null default now(),
  primary key (snapshot_date, hn_item_id, classifier_version)
);

create index if not exists classified_stories_date_idx
  on public.classified_stories (snapshot_date, classifier_version);

alter table public.classified_stories enable row level security;
