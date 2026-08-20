-- K-Stream account tables (Supabase Auth + Postgres RLS)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'User',
  color_a text not null default '#6366f1',
  color_b text not null default '#8b5cf6',
  icon text not null default 'user',
  device_name text,
  algorithm_prefs jsonb not null default '{"favoriteGenres":[],"moods":[],"franchises":[],"completedOnboarding":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  title text not null,
  year integer,
  poster text,
  type text not null check (type in ('movie', 'show')),
  groups jsonb not null default '[]'::jsonb,
  favorite_episodes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.bookmarks enable row level security;
create policy "bookmarks_all_own" on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.progress enable row level security;
create policy "progress_all_own" on public.progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

alter table public.watch_history enable row level security;
create policy "watch_history_all_own" on public.watch_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.manga_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  manga_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, manga_id)
);

alter table public.manga_progress enable row level security;
create policy "manga_progress_all_own" on public.manga_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.ratings enable row level security;
create policy "ratings_all_own" on public.ratings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "user_settings_all_own" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.group_order (
  user_id uuid primary key references auth.users(id) on delete cascade,
  groups text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.group_order enable row level security;
create policy "group_order_all_own" on public.group_order for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  last_seen timestamptz not null default now(),
  unique (user_id, device_name)
);

alter table public.devices enable row level security;
create policy "devices_all_own" on public.devices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, color_a, color_b, icon)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1), 'User'),
    coalesce(new.raw_user_meta_data->>'color_a', '#6366f1'),
    coalesce(new.raw_user_meta_data->>'color_b', '#8b5cf6'),
    coalesce(new.raw_user_meta_data->>'icon', 'user')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, payload) values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  insert into public.group_order (user_id, groups) values (new.id, '{}')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','bookmarks','progress','watch_history','manga_progress','ratings','user_settings','group_order','devices']
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
