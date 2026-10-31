-- Isolated local fixture matching the audited existing project; never run against hosted Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets values ('aoms-submissions','aoms-submissions',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema public,storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated;
create table public.media_submissions (
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 submitted_by uuid references auth.users(id) on delete set null,
 display_name text not null check (char_length(display_name) between 1 and 80),
 caption text not null check (char_length(caption) between 1 and 500),
 event_id text not null check (char_length(event_id) between 1 and 120),
 people_ids text[] not null default '{}',original_filename text not null check (char_length(original_filename) between 1 and 200),
 storage_path text unique,mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 file_size bigint not null check(file_size between 1 and 52428800),consent_confirmed boolean not null default false check(consent_confirmed),
 status text not null default 'pending' constraint media_submissions_status_check check(status in ('pending','approved','rejected')),
 reviewed_at timestamptz,review_notes text
);
alter table public.media_submissions enable row level security;
