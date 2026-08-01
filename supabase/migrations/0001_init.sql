-- ===========================================================================
-- Gambit File — initial schema
--
-- Shape of the world:
--   auth.users        Supabase-managed identity
--   profiles          1:1 app-side row per user
--   opponents         GLOBAL registry, unique on (platform, handle).
--                     Owns the shared cache: two users scouting the same
--                     player share one set of games and one report.
--   saved_opponents   per-user join onto opponents, carries private notes
--   games             normalized per-game cache rows, keyed by opponent
--   reports           computed dossier snapshot (jsonb), one per opponent
--
-- Writes to the shared tables (opponents/games/reports) happen only through
-- server routes using the service role. RLS below grants users read access
-- and full control over their own saved_opponents/profile, nothing more.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type platform as enum ('chesscom', 'lichess');
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_color as enum ('white', 'black');
exception when duplicate_object then null; end $$;

do $$ begin
  create type game_result as enum ('win', 'loss', 'draw');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sync_status as enum ('idle', 'syncing', 'error');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Mint a profile row the moment Supabase Auth creates the user, so the app
-- never has to deal with a signed-in user that has no profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- opponents  (global, shared cache owner)
-- ---------------------------------------------------------------------------
create table if not exists public.opponents (
  id             uuid primary key default gen_random_uuid(),
  platform       platform not null,
  -- `handle` is the lowercased canonical form used for lookups; the
  -- display form preserves whatever casing the platform reports.
  handle         text not null check (char_length(handle) between 1 and 64),
  display_handle text not null,

  -- Profile facts worth caching alongside the games.
  title          text,
  country        text,
  avatar_url     text,
  ratings        jsonb not null default '{}'::jsonb,

  -- Sync bookkeeping. `last_game_at` is the high-water mark used to ask the
  -- upstream API for "games since X" instead of refetching full history.
  last_synced_at timestamptz,
  last_game_at   timestamptz,
  games_count    integer not null default 0,
  sync_status    sync_status not null default 'idle',
  sync_error     text,
  sync_started_at timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint opponents_platform_handle_key unique (platform, handle)
);

drop trigger if exists opponents_touch on public.opponents;
create trigger opponents_touch
  before update on public.opponents
  for each row execute function public.touch_updated_at();

create index if not exists opponents_stale_idx
  on public.opponents (last_synced_at nulls first);

-- ---------------------------------------------------------------------------
-- saved_opponents  (per-user roster)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_opponents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  opponent_id uuid not null references public.opponents (id) on delete cascade,
  label       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint saved_opponents_user_opponent_key unique (user_id, opponent_id)
);

drop trigger if exists saved_opponents_touch on public.saved_opponents;
create trigger saved_opponents_touch
  before update on public.saved_opponents
  for each row execute function public.touch_updated_at();

create index if not exists saved_opponents_user_idx
  on public.saved_opponents (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- games  (normalized cache)
-- ---------------------------------------------------------------------------
-- One row per game from the opponent's point of view: `color` is the colour
-- THEY had, `result` is the outcome for THEM. That framing keeps the report
-- math free of per-row perspective flipping.
create table if not exists public.games (
  id              bigint generated always as identity primary key,
  opponent_id     uuid not null references public.opponents (id) on delete cascade,
  platform        platform not null,
  game_id         text not null,

  played_at       timestamptz not null,
  color           game_color not null,
  result          game_result not null,

  player_rating   integer,
  rival_rating    integer,
  rival_handle    text,

  time_class      text not null default 'unknown',
  time_control    text,
  rated           boolean not null default true,

  eco             text,
  opening_name    text,
  opening_slug    text,

  move_count      integer not null default 0,
  termination     text,
  url             text,

  -- First ~30 plies of SAN, enough to rebuild opening positions for the
  -- engine spot-check without storing every full PGN.
  moves_san       text,

  created_at      timestamptz not null default now(),

  constraint games_opponent_game_key unique (opponent_id, platform, game_id)
);

create index if not exists games_opponent_played_idx
  on public.games (opponent_id, played_at desc);

create index if not exists games_opponent_opening_idx
  on public.games (opponent_id, color, opening_slug);

-- ---------------------------------------------------------------------------
-- reports  (computed dossier snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  opponent_id    uuid primary key references public.opponents (id) on delete cascade,
  payload        jsonb not null,
  games_analyzed integer not null default 0,
  generated_at   timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles        enable row level security;
alter table public.opponents       enable row level security;
alter table public.saved_opponents enable row level security;
alter table public.games           enable row level security;
alter table public.reports         enable row level security;

-- profiles: yours and only yours.
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- opponents: the registry is public reference data to any signed-in user.
-- Mutation is service-role only (service role bypasses RLS entirely), which
-- keeps sync bookkeeping honest — a client cannot fake last_synced_at to
-- dodge a refresh.
drop policy if exists "opponents readable" on public.opponents;
create policy "opponents readable" on public.opponents
  for select to authenticated using (true);

-- saved_opponents: full CRUD over your own roster rows.
drop policy if exists "saved read own" on public.saved_opponents;
create policy "saved read own" on public.saved_opponents
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "saved insert own" on public.saved_opponents;
create policy "saved insert own" on public.saved_opponents
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "saved update own" on public.saved_opponents;
create policy "saved update own" on public.saved_opponents
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "saved delete own" on public.saved_opponents;
create policy "saved delete own" on public.saved_opponents
  for delete to authenticated using (auth.uid() = user_id);

-- games / reports: readable by signed-in users, written only by the server.
drop policy if exists "games readable" on public.games;
create policy "games readable" on public.games
  for select to authenticated using (true);

drop policy if exists "reports readable" on public.reports;
create policy "reports readable" on public.reports
  for select to authenticated using (true);

-- ===========================================================================
-- Helper: opponents whose cache has gone stale, for the cron sweep.
-- Only returns opponents at least one user has actually saved — there is no
-- point refreshing a one-off lookup nobody kept.
-- ===========================================================================
create or replace function public.stale_saved_opponents(ttl_hours integer default 24,
                                                        max_rows integer default 25)
returns table (
  id uuid,
  platform platform,
  handle text,
  last_synced_at timestamptz,
  saver_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.platform,
         o.handle,
         o.last_synced_at,
         count(s.id) as saver_count
    from public.opponents o
    join public.saved_opponents s on s.opponent_id = o.id
   where o.sync_status <> 'syncing'
     and (o.last_synced_at is null
          or o.last_synced_at < now() - make_interval(hours => ttl_hours))
   group by o.id
   order by o.last_synced_at asc nulls first
   limit max_rows;
$$;

revoke all on function public.stale_saved_opponents(integer, integer) from public, anon, authenticated;
