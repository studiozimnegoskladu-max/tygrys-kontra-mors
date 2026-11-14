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
-- BEZPIECZNE POKOJE KÓŁKO-KRZYŻYK — TOKEN GOSPODARZA I GOŚCIA
-- Klient nie odczytuje tabeli game_sessions bezpośrednio.
-- Każda operacja sprawdza token, a odpowiedzi RPC nie zawierają sekretów.
-- =========================================================
alter table public.game_sessions add column if not exists guest_token text;
alter table public.game_sessions add column if not exists host_token text;

drop function if exists public.szs_create_room(text,text);
drop function if exists public.szs_join_room(text);
drop function if exists public.szs_join_room(text,text);
drop function if exists public.szs_make_move(text,text,integer);
drop function if exists public.szs_restart_room(text,text);

create or replace function public.szs_secure_create_room(p_room_code text,p_creator_role text,p_host_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare created public.game_sessions;
begin
  if p_room_code !~ '^[A-Z0-9]{12}$' then raise exception 'Nieprawidłowy kod pokoju.'; end if;
  if p_creator_role not in ('tiger','mors') then raise exception 'Nieprawidłowa strona gracza.'; end if;
  if p_host_token is null or length(p_host_token)<32 then raise exception 'Nieprawidłowy token gospodarza.'; end if;
  insert into public.game_sessions(room_code,creator_role,host_token,board,turn,winner,status,guest_joined,guest_token)
  values(p_room_code,p_creator_role,p_host_token,'["","","","","","","","",""]'::jsonb,p_creator_role,null,'playing',false,null)
  returning * into created;
  return jsonb_build_object('room_code',created.room_code,'board',created.board,'turn',created.turn,'winner',created.winner,'status',created.status,'guest_joined',created.guest_joined,'creator_role',created.creator_role);
end; $$;

create or replace function public.szs_secure_join_room(p_room_code text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare joined public.game_sessions;
begin
  if p_guest_token is null or length(p_guest_token)<32 then raise exception 'Nieprawidłowy token gracza.'; end if;
  update public.game_sessions set guest_joined=true,guest_token=p_guest_token
   where room_code=upper(p_room_code) and status='playing'
     and (guest_joined=false or guest_token=p_guest_token)
  returning * into joined;
  if not found then raise exception 'Pokój nie istnieje albo ma już dwóch graczy.'; end if;
  return jsonb_build_object('room_code',joined.room_code,'board',joined.board,'turn',joined.turn,'winner',joined.winner,'status',joined.status,'guest_joined',joined.guest_joined,'creator_role',joined.creator_role);
end; $$;

create or replace function public.szs_secure_get_room(p_room_code text,p_player_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare game public.game_sessions;
begin
  select * into game from public.game_sessions
   where room_code=upper(p_room_code)
     and (host_token=p_player_token or (guest_joined and guest_token=p_player_token));
  if not found then raise exception 'Nie znaleziono pokoju lub token gracza jest nieprawidłowy.'; end if;
  return jsonb_build_object('room_code',game.room_code,'board',game.board,'turn',game.turn,'winner',game.winner,'status',game.status,'guest_joined',game.guest_joined,'creator_role',game.creator_role);
end; $$;

create or replace function public.szs_secure_make_move(p_room_code text,p_player_token text,p_cell integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  game public.game_sessions; b jsonb; player_role text; next_turn text;
  win text:=null; line integer[]; a text; c text; d text; empty_left boolean;
begin
  if p_cell is null or p_cell<0 or p_cell>8 then raise exception 'Nieprawidłowy ruch.'; end if;
  select * into game from public.game_sessions where room_code=upper(p_room_code) for update;
  if not found then raise exception 'Nie znaleziono pokoju.'; end if;
  if game.status<>'playing' then raise exception 'Ta partia jest już zakończona.'; end if;
  if p_player_token is not null and p_player_token=game.host_token then player_role:=game.creator_role;
  elsif p_player_token is not null and game.guest_joined and p_player_token=game.guest_token then
    player_role:=case when game.creator_role='tiger' then 'mors' else 'tiger' end;
  else raise exception 'Token gracza jest nieprawidłowy.'; end if;
  if game.turn<>player_role then raise exception 'Teraz ruch przeciwnika.'; end if;
  if game.board->>p_cell<>'' then raise exception 'To pole jest już zajęte.'; end if;
  b:=jsonb_set(game.board,array[p_cell::text],to_jsonb(player_role),false);
  foreach line slice 1 in array array[
    array[0,1,2],array[3,4,5],array[6,7,8],array[0,3,6],
    array[1,4,7],array[2,5,8],array[0,4,8],array[2,4,6]
  ] loop
    a:=b->>line[1]; c:=b->>line[2]; d:=b->>line[3];
    if a<>'' and a=c and c=d then win:=a; exit; end if;
  end loop;
  select exists(select 1 from generate_series(0,8) i where b->>i='') into empty_left;
  next_turn:=case when win is not null or not empty_left then game.turn
    when player_role='tiger' then 'mors' else 'tiger' end;
  update public.game_sessions set board=b,turn=next_turn,
    winner=coalesce(win,case when not empty_left then 'draw' else null end),
    status=case when win is not null or not empty_left then 'finished' else 'playing' end
   where room_code=upper(p_room_code) returning * into game;
  return jsonb_build_object('room_code',game.room_code,'board',game.board,'turn',game.turn,'winner',game.winner,'status',game.status,'guest_joined',game.guest_joined,'creator_role',game.creator_role);
end; $$;

create or replace function public.szs_secure_restart_room(p_room_code text,p_player_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare restarted public.game_sessions;
begin
  update public.game_sessions set board='["","","","","","","","",""]'::jsonb,
    turn=creator_role,winner=null,status='playing'
   where room_code=upper(p_room_code) and status='finished' and guest_joined=true
     and (host_token=p_player_token or (guest_token=p_player_token and guest_token is not null))
  returning * into restarted;
  if not found then raise exception 'Nie można rozpocząć rewanżu. Sprawdź token gracza i status meczu.'; end if;
  return jsonb_build_object('room_code',restarted.room_code,'board',restarted.board,'turn',restarted.turn,'winner',restarted.winner,'status',restarted.status,'guest_joined',restarted.guest_joined,'creator_role',restarted.creator_role);
end; $$;

revoke all on function public.szs_secure_create_room(text,text,text) from public;
revoke all on function public.szs_secure_join_room(text,text) from public;
revoke all on function public.szs_secure_get_room(text,text) from public;
revoke all on function public.szs_secure_make_move(text,text,integer) from public;
revoke all on function public.szs_secure_restart_room(text,text) from public;
grant execute on function public.szs_secure_create_room(text,text,text) to anon,authenticated;
grant execute on function public.szs_secure_join_room(text,text) to anon,authenticated;
grant execute on function public.szs_secure_get_room(text,text) to anon,authenticated;
grant execute on function public.szs_secure_make_move(text,text,integer) to anon,authenticated;
grant execute on function public.szs_secure_restart_room(text,text) to anon,authenticated;

drop policy if exists "Public can read game rooms" on public.game_sessions;
drop policy if exists "Public can create game rooms" on public.game_sessions;
drop policy if exists "Public can update game rooms" on public.game_sessions;
revoke all on public.game_sessions from anon,authenticated;

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


-- =========================================================
-- MORS CUP ONLINE — pokoje i atomowe ruchy papierowych piłkarzyków
-- Dostęp do stanu wyłącznie przez RPC z tokenem gracza.
-- =========================================================
create table if not exists public.szs_soccer_rooms (
  room_code text primary key,
  host_token text not null,
  guest_token text,
  guest_joined boolean not null default false,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.szs_soccer_rooms enable row level security;
revoke all on public.szs_soccer_rooms from anon, authenticated;

create or replace function public.szs_soccer_create_room(p_room_code text,p_host_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.szs_soccer_rooms;
begin
  if p_room_code !~ '^[A-Z0-9]{8}$' or length(coalesce(p_host_token,'')) < 20 then
    raise exception 'Nieprawidłowy kod lub token pokoju.';
  end if;
  insert into public.szs_soccer_rooms(room_code,host_token,state)
  values(p_room_code,p_host_token,jsonb_build_object(
    'lines','[]'::jsonb,'visits',jsonb_build_object('8,5',1),
    'position',jsonb_build_object('c',8,'r',5),'turn',0,
    'started',true,'over',false,'score','[0,0]'::jsonb,'history','[]'::jsonb))
  returning * into r;
  return jsonb_build_object('state',r.state,'guest_joined',r.guest_joined,'updated_at',r.updated_at);
end; $$;

create or replace function public.szs_soccer_join_room(p_room_code text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.szs_soccer_rooms;
begin
  if length(coalesce(p_guest_token,'')) < 20 then raise exception 'Brak tokenu gracza.'; end if;
  update public.szs_soccer_rooms
     set guest_joined=true,guest_token=p_guest_token,updated_at=now()
   where room_code=upper(p_room_code) and (guest_joined=false or guest_token=p_guest_token)
  returning * into r;
  if not found then raise exception 'Pokój nie istnieje albo jest już zajęty.'; end if;
  return jsonb_build_object('state',r.state,'guest_joined',r.guest_joined,'updated_at',r.updated_at);
end; $$;

create or replace function public.szs_soccer_get_room(p_room_code text,p_player_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare r public.szs_soccer_rooms;
begin
  select * into r from public.szs_soccer_rooms
   where room_code=upper(p_room_code) and (host_token=p_player_token or (guest_joined and guest_token=p_player_token));
  if not found then raise exception 'Nie znaleziono pokoju lub token gracza jest nieprawidłowy.'; end if;
  return jsonb_build_object('state',r.state,'guest_joined',r.guest_joined,'updated_at',r.updated_at);
end; $$;

create or replace function public.szs_soccer_move(p_room_code text,p_player_token text,p_c integer,p_r integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  g public.szs_soccer_rooms;
  st jsonb;
  pc integer; pr integer; turn_no integer; prior integer:=0;
  from_key text; to_key text; line_key text;
  edge boolean; goal boolean; can_move boolean:=false;
  nc integer; nr integer; score jsonb; lines jsonb; visits jsonb;
begin
  select * into g from public.szs_soccer_rooms
   where room_code=upper(p_room_code) and (host_token=p_player_token or (guest_joined and guest_token=p_player_token))
   for update;
  if not found then raise exception 'Nie znaleziono pokoju lub token gracza jest nieprawidłowy.'; end if;
  if not g.guest_joined then raise exception 'Czekamy na drugiego gracza.'; end if;
  st:=g.state;turn_no:=(st->>'turn')::integer;
  if (g.host_token=p_player_token and turn_no<>0) or (g.guest_token=p_player_token and turn_no<>1) then
    raise exception 'Teraz ruch przeciwnika.';
  end if;
  if coalesce((st->>'over')::boolean,true) then raise exception 'Mecz jest zakończony.'; end if;
  if p_c<0 or p_c>16 or p_r<0 or p_r>10 then raise exception 'Ruch poza boiskiem.'; end if;
  pc:=(st#>>'{position,c}')::integer;pr:=(st#>>'{position,r}')::integer;
  if greatest(abs(p_c-pc),abs(p_r-pr))<>1 then raise exception 'Możesz przesunąć piłkę tylko na sąsiednią kropkę, także po przekątnej.'; end if;
  from_key:=pc||','||pr;to_key:=p_c||','||p_r;
  line_key:=least(from_key,to_key)||'|'||greatest(from_key,to_key);
  lines:=coalesce(st->'lines','[]'::jsonb);
  if lines ? line_key then raise exception 'Ta kreska została już wykorzystana.'; end if;
  visits:=coalesce(st->'visits','{}'::jsonb);
  prior:=coalesce((visits->>to_key)::integer,0);
  lines:=lines||jsonb_build_array(line_key);
  visits:=jsonb_set(visits,array[to_key],to_jsonb(prior+1),true);
  score:=coalesce(st->'score','[0,0]'::jsonb);
  goal:=(p_r=0 or p_r=10) and p_c between 7 and 9;
  edge:=p_c=0 or p_c=16 or p_r=0 or p_r=10;
  if goal then
    score:=jsonb_set(score,array[turn_no::text],to_jsonb((score->>turn_no)::integer+1),false);
    st:=jsonb_set(st,'{over}','true'::jsonb,true);
  elsif prior=0 and not edge then
    st:=jsonb_set(st,'{turn}',to_jsonb(1-turn_no),true);
  end if;
  st:=jsonb_set(st,'{lines}',lines,true);
  st:=jsonb_set(st,'{visits}',visits,true);
  st:=jsonb_set(st,'{position}',jsonb_build_object('c',p_c,'r',p_r),true);
  st:=jsonb_set(st,'{score}',score,true);
  if not goal then
    for nc in greatest(0,p_c-1)..least(16,p_c+1) loop
      for nr in greatest(0,p_r-1)..least(10,p_r+1) loop
        if greatest(abs(nc-p_c),abs(nr-p_r))=1 then
          from_key:=p_c||','||p_r;to_key:=nc||','||nr;
          line_key:=least(from_key,to_key)||'|'||greatest(from_key,to_key);
          if not (lines ? line_key) then can_move:=true; end if;
        end if;
      end loop;
    end loop;
    if not can_move then
      score:=jsonb_set(score,array[(1-(st->>'turn')::integer)::text],to_jsonb((score->>(1-(st->>'turn')::integer))::integer+1),false);
      st:=jsonb_set(st,'{score}',score,true);
      st:=jsonb_set(st,'{over}','true'::jsonb,true);
    end if;
  end if;
  update public.szs_soccer_rooms set state=st,updated_at=now() where room_code=g.room_code returning * into g;
  return jsonb_build_object('state',g.state,'guest_joined',g.guest_joined,'updated_at',g.updated_at);
end; $$;

create or replace function public.szs_soccer_reset_room(p_room_code text,p_player_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare g public.szs_soccer_rooms; st jsonb;
begin
  select * into g from public.szs_soccer_rooms
   where room_code=upper(p_room_code) and (host_token=p_player_token or (guest_joined and guest_token=p_player_token))
   for update;
  if not found then raise exception 'Nie znaleziono pokoju lub token gracza jest nieprawidłowy.'; end if;
  if not g.guest_joined or not coalesce((g.state->>'over')::boolean,false) then
    raise exception 'Rewanż można rozpocząć po zakończeniu meczu i dołączeniu obu graczy.';
  end if;
  st:=jsonb_build_object('lines','[]'::jsonb,'visits',jsonb_build_object('8,5',1),
    'position',jsonb_build_object('c',8,'r',5),'turn',0,'started',true,'over',false,
    'score',g.state->'score','history','[]'::jsonb);
  update public.szs_soccer_rooms set state=st,updated_at=now() where room_code=g.room_code returning * into g;
  return jsonb_build_object('state',g.state,'guest_joined',g.guest_joined,'updated_at',g.updated_at);
end; $$;

revoke all on function public.szs_soccer_create_room(text,text) from public;
revoke all on function public.szs_soccer_join_room(text,text) from public;
revoke all on function public.szs_soccer_get_room(text,text) from public;
revoke all on function public.szs_soccer_move(text,text,integer,integer) from public;
revoke all on function public.szs_soccer_reset_room(text,text) from public;
grant execute on function public.szs_soccer_create_room(text,text) to anon,authenticated;
grant execute on function public.szs_soccer_join_room(text,text) to anon,authenticated;
grant execute on function public.szs_soccer_get_room(text,text) to anon,authenticated;
grant execute on function public.szs_soccer_move(text,text,integer,integer) to anon,authenticated;
grant execute on function public.szs_soccer_reset_room(text,text) to anon,authenticated;
notify pgrst,'reload schema';
