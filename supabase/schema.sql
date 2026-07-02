-- =============================================
-- GLM Demo — Database Schema
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. users
-- Extends Supabase auth.users; one-to-one via id = auth.users.id
-- =============================================
create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.users enable row level security;

-- Users can read their own row
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

-- Users can upsert their own row (insert/update)
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);


-- 2. niches
-- =============================================
create type niche_status as enum ('pending', 'training', 'ready');

create table if not exists public.niches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  name       text not null,
  description text,
  status     niche_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.niches enable row level security;

create policy "niches_owner_access" on public.niches
  for all using (auth.uid() = user_id);


-- 3. niche_videos
-- =============================================
create table if not exists public.niche_videos (
  id          uuid primary key default gen_random_uuid(),
  niche_id    uuid not null references public.niches(id) on delete cascade,
  youtube_url text not null,
  title       text,
  transcript  text,
  analyzed_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.niche_videos enable row level security;

create policy "niche_videos_owner_access" on public.niche_videos
  for all using (
    auth.uid() = (
      select user_id from public.niches where id = niche_id
    )
  );


-- 4. niche_profile
-- =============================================
create table if not exists public.niche_profile (
  id                        uuid primary key default gen_random_uuid(),
  niche_id                  uuid not null unique references public.niches(id) on delete cascade,
  tone                      text,
  style                     text,
  common_topics             jsonb not null default '[]'::jsonb,
  hooks                     jsonb not null default '[]'::jsonb,
  keywords                  jsonb not null default '[]'::jsonb,
  audience_type             text,
  content_structure_pattern text,
  created_at                timestamptz not null default now()
);

alter table public.niche_profile enable row level security;

create policy "niche_profile_owner_access" on public.niche_profile
  for all using (
    auth.uid() = (
      select user_id from public.niches where id = niche_id
    )
  );


-- 5. scripts
-- =============================================
create table if not exists public.scripts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) on delete cascade,
  niche_id         uuid references public.niches(id) on delete cascade,
  title            text not null,
  duration_minutes int not null,
  status           text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),
  created_at       timestamptz not null default now()
);

alter table public.scripts enable row level security;

create policy "scripts_owner_access" on public.scripts
  for all using (auth.uid() = user_id);


-- 6. script_scenes
-- =============================================
create table if not exists public.script_scenes (
  id               uuid primary key default gen_random_uuid(),
  script_id        uuid not null references public.scripts(id) on delete cascade,
  scene_number     int not null,
  scene_type       text not null
    check (scene_type in ('hook', 'intro', 'section', 'transition', 'outro')),
  title            text not null,
  content          text not null,
  duration_seconds int not null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.script_scenes enable row level security;

create policy "script_scenes_owner_access" on public.script_scenes
  for all using (
    auth.uid() = (
      select user_id from public.scripts where id = script_id
    )
  );


-- =============================================
-- Helper: auto-create a public.users row when
-- a new auth.user signs up
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
