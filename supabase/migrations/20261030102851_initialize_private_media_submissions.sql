create table if not exists public.media_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  caption text not null check (char_length(caption) between 1 and 500),
  event_id text not null check (char_length(event_id) between 1 and 120),
  people_ids text[] not null default '{}',
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  storage_path text unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  consent_confirmed boolean not null default false check (consent_confirmed),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  review_notes text
);
alter table public.media_submissions enable row level security;
revoke all on public.media_submissions from anon, authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('aoms-submissions','aoms-submissions',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;
