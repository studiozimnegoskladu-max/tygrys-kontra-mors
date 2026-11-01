-- TYGRYS KONTRA MORS — konfiguracja Supabase
-- Wklej CAŁY skrypt w Supabase: SQL Editor -> New query -> Run.

create table if not exists public.game_sessions (
  room_code text primary key,
  board jsonb not null default '["","","","","","","","",""]'::jsonb,
  turn text not null default 'tiger',
  winner text,
  status text not null default 'playing',
  guest_joined boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.game_sessions enable row level security;

drop policy if exists "Public can read game rooms" on public.game_sessions;
create policy "Public can read game rooms"
on public.game_sessions for select to anon using (true);

drop policy if exists "Public can create game rooms" on public.game_sessions;
create policy "Public can create game rooms"
on public.game_sessions for insert to anon with check (true);

drop policy if exists "Public can update game rooms" on public.game_sessions;
create policy "Public can update game rooms"
on public.game_sessions for update to anon using (true) with check (true);

-- Włącz aktualizacje realtime dla tabeli.
do $$
begin
  alter publication supabase_realtime add table public.game_sessions;
exception when duplicate_object then
  null;
end $$;


-- Migracja wyboru postaci: osoba tworząca pokój zapisuje wybraną postać.
alter table public.game_sessions add column if not exists creator_role text not null default 'tiger';
