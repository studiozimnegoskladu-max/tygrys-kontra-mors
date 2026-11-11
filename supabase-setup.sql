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


-- Globalny ranking graczy. Identyfikator jest losowy i przechowywany lokalnie w przeglądarce.
create table if not exists public.player_leaderboard (
  player_id text primary key,
  nickname text not null default 'Gracz',
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.player_leaderboard enable row level security;
drop policy if exists "Public can read leaderboard" on public.player_leaderboard;
create policy "Public can read leaderboard" on public.player_leaderboard for select to anon using (true);
drop policy if exists "Public can add leaderboard entries" on public.player_leaderboard;
create policy "Public can add leaderboard entries" on public.player_leaderboard for insert to anon with check (true);
drop policy if exists "Public can update leaderboard entries" on public.player_leaderboard;
create policy "Public can update leaderboard entries" on public.player_leaderboard for update to anon using (true) with check (true);


-- =========================================================
-- BEZPIECZNIEJSZA OBSŁUGA POKOI (migracja 2026-11)
-- Zmiany stanu gry przechodzą przez funkcje RPC, które
-- atomowo sprawdzają kolejkę, zajętość pola i koniec partii.
-- Klient nie może już bezpośrednio INSERT/UPDATE tabeli.
-- =========================================================

-- Dłuższe kody nowych pokoi utrudniają ich odgadnięcie.
-- Stare pokoje z krótszymi kodami pozostają dostępne do końca partii.

drop policy if exists "Public can create game rooms" on public.game_sessions;
drop policy if exists "Public can update game rooms" on public.game_sessions;

revoke insert, update, delete on public.game_sessions from anon, authenticated;
grant select on public.game_sessions to anon, authenticated;

create or replace function public.szs_create_room(
  p_room_code text,
  p_creator_role text
) returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.game_sessions;
begin
  if p_room_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Nieprawidłowy kod pokoju.';
  end if;
  if p_creator_role not in ('tiger','mors') then
    raise exception 'Nieprawidłowa strona gracza.';
  end if;

  insert into public.game_sessions
    (room_code, creator_role, board, turn, winner, status, guest_joined)
  values
    (p_room_code, p_creator_role, '["","","","","","","","",""]'::jsonb,
     p_creator_role, null, 'playing', false)
  returning * into created;

  return created;
end;
$$;

-- Identyfikator drugiego gracza pozwala bezpiecznie ponowić wejście
-- po utracie połączenia, ale nie wpuszcza trzeciej osoby do zajętego pokoju.
alter table public.game_sessions add column if not exists guest_token text;
drop function if exists public.szs_join_room(text);
create or replace function public.szs_join_room(
  p_room_code text,
  p_guest_token text
) returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  joined public.game_sessions;
begin
  if p_guest_token is null or length(trim(p_guest_token)) < 8 then
    raise exception 'Brak identyfikatora gracza. Odśwież stronę i spróbuj ponownie.';
  end if;

  update public.game_sessions
     set guest_joined = true,
         guest_token = p_guest_token
   where room_code = upper(p_room_code)
     and status = 'playing'
     and (guest_joined = false or guest_token = p_guest_token)
  returning * into joined;

  if not found then
    raise exception 'Pokój nie istnieje albo ma już dwóch graczy.';
  end if;
  return joined;
end;
$$;

create or replace function public.szs_make_move(
  p_room_code text,
  p_role text,
  p_cell integer
) returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.game_sessions;
  b jsonb;
  next_turn text;
  win text := null;
  line integer[];
  a text;
  c text;
  d text;
  empty_left boolean;
begin
  if p_role not in ('tiger','mors') or p_cell < 0 or p_cell > 8 then
    raise exception 'Nieprawidłowy ruch.';
  end if;

  select * into game
    from public.game_sessions
   where room_code = upper(p_room_code)
   for update;

  if not found then raise exception 'Nie znaleziono pokoju.'; end if;
  if game.status <> 'playing' then raise exception 'Ta partia jest już zakończona.'; end if;
  if game.guest_joined is not true and game.creator_role <> p_role then
    raise exception 'Przed dołączeniem drugiego gracza może wykonać ruch tylko osoba, która utworzyła pokój.';
  end if;
  if game.turn <> p_role then raise exception 'Teraz ruch przeciwnika.'; end if;
  if game.board ->> p_cell <> '' then raise exception 'To pole jest już zajęte.'; end if;

  b := game.board;
  b := jsonb_set(b, array[p_cell::text], to_jsonb(p_role), false);

  foreach line slice 1 in array array[
    array[0,1,2], array[3,4,5], array[6,7,8],
    array[0,3,6], array[1,4,7], array[2,5,8],
    array[0,4,8], array[2,4,6]
  ] loop
    a := b ->> line[1];
    c := b ->> line[2];
    d := b ->> line[3];
    if a <> '' and a = c and c = d then
      win := a;
      exit;
    end if;
  end loop;

  select exists (
    select 1 from generate_series(0,8) i where b ->> i = ''
  ) into empty_left;

  next_turn := case when win is not null or not empty_left then game.turn
                    when p_role = 'tiger' then 'mors' else 'tiger' end;

  update public.game_sessions
     set board = b,
         turn = next_turn,
         winner = coalesce(win, case when not empty_left then 'draw' else null end),
         status = case when win is not null or not empty_left then 'finished' else 'playing' end
   where room_code = upper(p_room_code)
  returning * into game;

  return game;
end;
$$;

create or replace function public.szs_restart_room(
  p_room_code text,
  p_role text
) returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  restarted public.game_sessions;
begin
  if p_role not in ('tiger','mors') then raise exception 'Nieprawidłowy gracz.'; end if;

  update public.game_sessions
     set board = '["","","","","","","","",""]'::jsonb,
         turn = creator_role,
         winner = null,
         status = 'playing'
   where room_code = upper(p_room_code)
     and status = 'finished'
     and guest_joined = true
  returning * into restarted;

  if not found then raise exception 'Nie można rozpocząć kolejnej rundy.'; end if;
  return restarted;
end;
$$;

revoke all on function public.szs_create_room(text,text) from public;
revoke all on function public.szs_join_room(text,text) from public;
revoke all on function public.szs_make_move(text,text,integer) from public;
revoke all on function public.szs_restart_room(text,text) from public;
grant execute on function public.szs_create_room(text,text) to anon, authenticated;
grant execute on function public.szs_join_room(text,text) to anon, authenticated;
grant execute on function public.szs_make_move(text,text,integer) to anon, authenticated;
grant execute on function public.szs_restart_room(text,text) to anon, authenticated;


-- Tabela rankingu nie jest używana bezpośrednio przez klienta gry.
-- Zapis odbywa się przez osobny skrypt rankingowy; blokujemy anonimowe
-- modyfikacje tabeli Supabase, pozostawiając odczyt.
drop policy if exists "Public can add leaderboard entries" on public.player_leaderboard;
drop policy if exists "Public can update leaderboard entries" on public.player_leaderboard;
revoke insert, update, delete on public.player_leaderboard from anon, authenticated;
grant select on public.player_leaderboard to anon, authenticated;


-- Uprawnienia i odświeżenie cache API po wdrożeniu funkcji RPC.
grant usage on schema public to anon, authenticated;
notify pgrst, 'reload schema';
