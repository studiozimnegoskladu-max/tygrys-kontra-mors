-- Zabezpieczenie profili i zapisów do turniejów Mors Cup.
-- Wymaga istniejących tabel Mors Cup utworzonych w projekcie Supabase.
-- Operacje zapisu wykonują wyłącznie poniższe RPC z tokenem profilu.

alter table public.morscup_players add column if not exists player_token text;

create or replace function public.szs_morscup_save_profile(
  p_player_id text,p_player_token text,p_nickname text,p_mascot text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved public.morscup_players;
begin
  if p_player_id is null or length(p_player_id)<8 or length(p_player_id)>80 then
    raise exception 'Nieprawidłowy identyfikator zawodnika.';
  end if;
  if p_player_token is null or length(p_player_token)<32 then
    raise exception 'Nieprawidłowy token profilu.';
  end if;
  if p_nickname is null or length(trim(p_nickname))<2 or length(trim(p_nickname))>24 then
    raise exception 'Pseudonim musi mieć od 2 do 24 znaków.';
  end if;
  if p_mascot not in ('mors','tiger','goat','bobr','llama','octopus') then
    raise exception 'Nieprawidłowa maskotka zawodnika.';
  end if;
  insert into public.morscup_players(player_id,nickname,mascot,player_token,updated_at)
  values(p_player_id,trim(p_nickname),p_mascot,p_player_token,now())
  on conflict(player_id) do update
    set nickname=excluded.nickname,mascot=excluded.mascot,
        player_token=coalesce(public.morscup_players.player_token,excluded.player_token),
        updated_at=now()
    where public.morscup_players.player_token=p_player_token
       or (public.morscup_players.player_token is null
         and not exists(select 1 from public.morscup_matches m where m.player_one_id=p_player_id or m.player_two_id=p_player_id)
         and not exists(select 1 from public.morscup_tournament_entries e where e.player_id=p_player_id))
  returning * into saved;
  if not found then
    raise exception 'Ten profil jest już zabezpieczony innym urządzeniem albo ma zapisane wyniki.';
  end if;
  return jsonb_build_object('player_id',saved.player_id,'nickname',saved.nickname,'mascot',saved.mascot);
end; $$;

create or replace function public.szs_morscup_join_tournament(
  p_tournament_id uuid,p_player_id text,p_player_token text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare tournament public.morscup_tournaments; current_count integer; inserted_count integer;
begin
  if p_player_id is null or p_player_token is null or length(p_player_token)<32 then
    raise exception 'Najpierw zapisz i zabezpiecz swój profil zawodnika.';
  end if;
  perform 1 from public.morscup_players where player_id=p_player_id and player_token=p_player_token;
  if not found then raise exception 'Profil nie został odnaleziony lub token jest nieprawidłowy.'; end if;
  select * into tournament from public.morscup_tournaments
   where id=p_tournament_id and status='registration' for update;
  if not found then raise exception 'Zapisy do tego turnieju są już zamknięte.'; end if;
  if exists(select 1 from public.morscup_tournament_entries where tournament_id=p_tournament_id and player_id=p_player_id) then
    return jsonb_build_object('joined',true,'already_joined',true);
  end if;
  select count(*) into current_count from public.morscup_tournament_entries where tournament_id=p_tournament_id;
  if current_count>=tournament.capacity then raise exception 'Wszystkie miejsca w turnieju są już zajęte.'; end if;
  insert into public.morscup_tournament_entries(tournament_id,player_id)
  values(p_tournament_id,p_player_id) on conflict(tournament_id,player_id) do nothing;
  get diagnostics inserted_count=row_count;
  return jsonb_build_object('joined',inserted_count=1,'already_joined',inserted_count=0);
end; $$;

revoke all on function public.szs_morscup_save_profile(text,text,text,text) from public;
revoke all on function public.szs_morscup_join_tournament(uuid,text,text) from public;
grant execute on function public.szs_morscup_save_profile(text,text,text,text) to anon,authenticated;
grant execute on function public.szs_morscup_join_tournament(uuid,text,text) to anon,authenticated;

drop policy if exists "Mors Cup public register players" on public.morscup_players;
drop policy if exists "Mors Cup public update players" on public.morscup_players;
drop policy if exists "Mors Cup public submit matches" on public.morscup_matches;
drop policy if exists "Mors Cup public join tournaments" on public.morscup_tournament_entries;
drop policy if exists "Mors Cup public insert tournament matches" on public.morscup_tournament_matches;
drop policy if exists "Mors Cup public update tournament matches" on public.morscup_tournament_matches;
drop policy if exists "Mors Cup public create tournaments" on public.morscup_tournaments;
drop policy if exists "Mors Cup public update tournaments" on public.morscup_tournaments;

revoke all on table public.morscup_players,public.morscup_seasons,public.morscup_matches,
  public.morscup_tournaments,public.morscup_tournament_entries,public.morscup_tournament_matches
  from public,anon,authenticated;
revoke all on public.morscup_league_table from public,anon,authenticated;

-- Publiczny odczyt wyników i terminarzy pozostaje dostępny.
grant select (player_id,nickname,mascot,created_at,updated_at)
  on table public.morscup_players to anon,authenticated;
grant select on table public.morscup_seasons,public.morscup_matches,
  public.morscup_tournaments,public.morscup_tournament_entries,
  public.morscup_tournament_matches to anon,authenticated;
grant select on public.morscup_league_table to anon,authenticated;

notify pgrst,'reload schema';
