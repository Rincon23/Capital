-- Capital — cloud storage schema (Supabase Postgres)
--
-- Replaces the local IndexedDB store. One account per auth user; every row is
-- scoped to auth.uid() and protected by Row Level Security. A month's data is
-- stored with the exact shape of MonthData (lib/budget/types.ts) so the pure
-- calculation layer is reused unchanged.
--
-- Apply with the Supabase SQL Editor, or `supabase db push`. Safe to re-run.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Minimal today; room for a display name later.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner can read" on public.profiles;
create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: owner can update" on public.profiles;
create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- budget_settings: one row per user — the envelope config plus the special
-- category labels. Equivalent to the single Dexie `settings` record.
-- ---------------------------------------------------------------------------
create table if not exists public.budget_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  topics jsonb not null,
  special_categories jsonb not null,
  special_category_colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Additive: safe to run on a budget_settings table created before colors existed.
alter table public.budget_settings
  add column if not exists special_category_colors jsonb not null default '{}'::jsonb;

alter table public.budget_settings enable row level security;

drop policy if exists "budget_settings: owner full access" on public.budget_settings;
create policy "budget_settings: owner full access"
  on public.budget_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- months: one row per (user, competence month "YYYY-MM"). The MonthData shape,
-- with arrays / maps kept verbatim as jsonb.
-- ---------------------------------------------------------------------------
create table if not exists public.months (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null,
  incomes jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  carry_in jsonb not null default '{}'::jsonb,
  topics_snapshot jsonb not null default '[]'::jsonb,
  closed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, month),
  constraint months_month_format check (month ~ '^[0-9]{4}-[0-9]{2}$')
);

alter table public.months enable row level security;

drop policy if exists "months: owner full access" on public.months;
create policy "months: owner full access"
  on public.months for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists months_user_id_month_idx on public.months (user_id, month);

-- ---------------------------------------------------------------------------
-- Data API access. Since 2026-04-28 tables in `public` are NOT exposed to the
-- Data API automatically — grant the privileges the `authenticated` role needs
-- explicitly. `anon` gets nothing: every table requires a signed-in user.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.budget_settings to authenticated;
grant select, insert, update, delete on public.months to authenticated;

-- ---------------------------------------------------------------------------
-- Create the profile row automatically on signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- SECURITY DEFINER functions in `public` are callable by every role by default;
-- this one is only ever run by the trigger below.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep updated_at current on writes.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists budget_settings_set_updated_at on public.budget_settings;
create trigger budget_settings_set_updated_at
  before update on public.budget_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists months_set_updated_at on public.months;
create trigger months_set_updated_at
  before update on public.months
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Tell PostgREST (the Data API) to pick up the new tables immediately, instead
-- of waiting for its periodic schema-cache refresh.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
