-- Schema da implementação nova de contas do Clique na Suzy.
-- Pode ser executado sobre a tabela leaderboard já usada pelo projeto.

create table if not exists public.leaderboard (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  score bigint not null default 0 check (score >= 0),
  coins bigint,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint leaderboard_username_length_v2 check (char_length(username) between 3 and 20),
  constraint leaderboard_coins_nonnegative_v2 check (coins is null or coins >= 0)
);

alter table public.leaderboard add column if not exists username text;
alter table public.leaderboard add column if not exists score bigint not null default 0;
alter table public.leaderboard add column if not exists coins bigint;
alter table public.leaderboard add column if not exists progress jsonb not null default '{}'::jsonb;
alter table public.leaderboard add column if not exists updated_at timestamptz not null default now();
alter table public.leaderboard enable row level security;

create unique index if not exists leaderboard_username_unique
  on public.leaderboard (lower(username));

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;
grant insert (id, username, score, coins, progress, updated_at) on public.leaderboard to authenticated;
grant update (username, score, coins, progress, updated_at) on public.leaderboard to authenticated;

drop policy if exists "Anyone can read leaderboard" on public.leaderboard;
drop policy if exists "Players can add their own score" on public.leaderboard;
drop policy if exists "Players can update their own score" on public.leaderboard;
drop policy if exists "accounts_v2_read_ranking" on public.leaderboard;
drop policy if exists "accounts_v2_insert_self" on public.leaderboard;
drop policy if exists "accounts_v2_update_self" on public.leaderboard;

create policy "accounts_v2_read_ranking" on public.leaderboard
  for select to anon, authenticated using (true);
create policy "accounts_v2_insert_self" on public.leaderboard
  for insert to authenticated with check (auth.uid() = id);
create policy "accounts_v2_update_self" on public.leaderboard
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.create_leaderboard_profile_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  v_username := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'Jogador'), 20);

  -- Libera nomes de contas que nunca confirmaram o e-mail após dez minutos.
  update public.leaderboard as profile
  set username = 'Exp_' || replace(left(profile.id::text, 16), '-', '')
  from auth.users as old_user
  where old_user.id = profile.id
    and lower(profile.username) = lower(v_username)
    and old_user.email_confirmed_at is null
    and old_user.created_at < now() - interval '10 minutes';

  insert into public.leaderboard (id, username, score, coins)
  values (new.id, v_username, 0, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_leaderboard on auth.users;
drop trigger if exists on_auth_user_created_leaderboard_v2 on auth.users;
create trigger on_auth_user_created_leaderboard_v2
  after insert on auth.users
  for each row execute procedure public.create_leaderboard_profile_v2();
