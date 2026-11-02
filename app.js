(() => {
  const $ = id => document.getElementById(id);
  const setup=$('setup'), game=$('game'), msg=$('setupMessage');
  const cells=[...document.querySelectorAll('.cell')];
  const TIGER='tiger', MORS='mors';
  let client,room=null,role=null,channel=null,current=null,mode='online',busy=false,cpuDifficulty=localStorage.getItem('tkm_cpu_difficulty')||'normal';
  let scores={tiger:0,mors:0},seriesWinner=null,commentIndex=0,achievementStats=loadStats(),soundOn=localStorage.getItem('tkm_sound')!=='off',startedAt=0,timer=null,audioContext=null;
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh=()=>({board:Array(9).fill(''),turn:TIGER,winner:null,status:'playing',winning:[]});
  const nick=()=>localStorage.getItem('tkm_nick')||'Gracz';
  const STATS_KEY='tkm_achievements_v1';
  function loadStats(){try{return Object.assign({played:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0,unlocked:[],seen:[]},JSON.parse(localStorage.getItem(STATS_KEY)||'{}'))}catch{return{played:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0,unlocked:[],seen:[]}}}
  const achievementList=[
    {id:'first-game',icon:'🎮',name:'Pierwsze starcie',desc:'Rozegraj pierwszą partię',test:s=>s.played>=1},
    {id:'first-win',icon:'🏆',name:'Pierwsza krew',desc:'Wygraj pierwszą partię',test:s=>s.wins>=1},
    {id:'hat-trick',icon:'🔥',name:'Hat-trick',desc:'Wygraj 3 partie',test:s=>s.wins>=3},
    {id:'hot-streak',icon:'⚡',name:'Nie do zatrzymania',desc:'Wygraj 5 partii z rzędu',test:s=>s.bestStreak>=5},
    {id:'veteran',icon:'🎖️',name:'Weteran planszy',desc:'Rozegraj 10 partii',test:s=>s.played>=10},
    {id:'peace',icon:'🤝',name:'Zgoda buduje',desc:'Zakończ partię remisem',test:s=>s.draws>=1},
    {id:'champion',icon:'👑',name:'Legenda pojedynków',desc:'Zdobądź 10 zwycięstw',test:s=>s.wins>=10}
  ];
  function saveStats(){localStorage.setItem(STATS_KEY,JSON.stringify(achievementStats));}
  function recordFinishedGame(result,board,gameMode,gameRoom){
    if(!result)return;
    const key=[gameMode,gameRoom||'local',board.join(''),result].join('|');
    if(achievementStats.seen.includes(key))return;
    achievementStats.seen.push(key);if(achievementStats.seen.length>100)achievementStats.seen=achievementStats.seen.slice(-100);
    achievementStats.played++;
    if(result==='draw'){achievementStats.draws++;achievementStats.streak=0;}
    else if(gameMode==='local'){achievementStats.streak=0;}
    else if((gameMode==='cpu'&&result===TIGER)||(gameMode==='online'&&result===role)){
      achievementStats.wins++;achievementStats.streak++;achievementStats.bestStreak=Math.max(achievementStats.bestStreak,achievementStats.streak);
    }else{achievementStats.losses++;achievementStats.streak=0;}
    const newly=achievementList.filter(x=>x.test(achievementStats)&&!achievementStats.unlocked.includes(x.id));
    newly.forEach(x=>achievementStats.unlocked.push(x.id));saveStats();renderAchievements();syncLeaderboard(result,gameMode,gameRoom,board);
    if(newly.length){const el=$('achievementNotice');if(el)el.textContent='NOWA ODZNAKA: '+newly.map(x=>x.icon+' '+x.name).join(' · ');celebrate();}
  }

  const PLAYER_ID_KEY='tkm_player_id_v1', RANK_STATS_KEY='tkm_rank_stats_v1';
  function playerId(){let id=localStorage.getItem(PLAYER_ID_KEY);if(!id){id=(crypto.randomUUID?crypto.randomUUID():('tkm-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(PLAYER_ID_KEY,id)}return id}
  function rankStats(){try{return Object.assign({played:0,wins:0,losses:0,draws:0,seen:[]},JSON.parse(localStorage.getItem(RANK_STATS_KEY)||'{}'))}catch{return{played:0,wins:0,losses:0,draws:0,seen:[]}}}
  const LEADERBOARD_URL='https://script.google.com/macros/s/AKfycbxA24BQOkFe3LVBFwFCR1Q9AattnidtJP1YRxUHELO4nsBWZ63C6qM4U9nwnlG8xlqfcA/exec';
  async function syncLeaderboard(result,gameMode,gameRoom,board){
    if(!['online','cpu'].includes(gameMode))return;
    const won=(gameMode==='cpu'&&result===TIGER)||(gameMode==='online'&&result===role);
    const lost=result!=='draw'&&!won;
    const stats=rankStats(), key=[gameMode,gameRoom||'cpu',board.join(''),result,role||''].join('|');
    if(stats.seen.includes(key))return;
    stats.seen.push(key);if(stats.seen.length>100)stats.seen=stats.seen.slice(-100);
    stats.played++;if(result==='draw')stats.draws++;else if(won)stats.wins++;else if(lost)stats.losses++;
    localStorage.setItem(RANK_STATS_KEY,JSON.stringify(stats));
    const row={player_id:playerId(),nickname:nick(),played:stats.played,wins:stats.wins,losses:stats.losses,draws:stats.draws};
    try{
      await fetch(LEADERBOARD_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(row)});
      const status=$('leaderboardStatus');if(status)status.textContent='Wynik wysłany do rankingu. Odświeżam tabelę…';
      setTimeout(loadLeaderboard,1200);
    }catch(error){
      console.warn('Nie udało się wysłać wyniku do rankingu:',error);
      const status=$('leaderboardStatus');if(status)status.textContent='Nie udało się wysłać wyniku. Sprawdź wdrożenie Google Apps Script.';
    }
  }
  function loadLeaderboard(){
    const list=$('leaderboardList');if(!list)return;
    const status=$('leaderboardStatus');if(status)status.textContent='Pobieram najlepszych graczy…';
    const callback='tkmRanking_'+Date.now()+'_'+Math.floor(Math.random()*100000);
    const script=document.createElement('script');
    const cleanup=()=>{try{delete window[callback]}catch{window[callback]=undefined}script.remove()};
    const timeout=setTimeout(()=>{cleanup();if(status)status.textContent='Nie udało się pobrać rankingu. Sprawdź, czy aplikacja Google jest dostępna dla każdego.'},12000);
    window[callback]=data=>{
      clearTimeout(timeout);cleanup();
      if(!data||!data.success){if(status)status.textContent='Ranking zwrócił nieprawidłową odpowiedź.';return}
      list.innerHTML='';
      (data.players||[]).forEach((row,i)=>{
        const item=document.createElement('div');item.className='rank-row';
        const rank=document.createElement('b');rank.textContent=String(i+1)+'.';
        const name=document.createElement('span');name.textContent=row.nickname||'Gracz';
        const wins=document.createElement('strong');wins.textContent=String(row.wins||0)+' WYGR.';
        const detail=document.createElement('small');detail.textContent='P: '+(row.played||0)+' · R: '+(row.draws||0);
        item.append(rank,name,wins,detail);list.append(item);
      });
      if(!data.players||!data.players.length){const empty=document.createElement('p');empty.className='rank-empty';empty.textContent='Jeszcze nikt nie zdobył punktów. Zostań pierwszym liderem!';list.append(empty)}
      if(status)status.textContent='TOP 10 GRACZY · AKTUALIZACJA PO MECZU';
    };
    script.onerror=()=>{clearTimeout(timeout);cleanup();if(status)status.textContent='Nie udało się połączyć z rankingiem Google.'};
    script.src=LEADERBOARD_URL+'?callback='+encodeURIComponent(callback)+'&t='+Date.now();
    document.head.appendChild(script);
  }
  function renderAchievements(){
    const el=$('achievementGrid');if(!el)return;
    el.innerHTML='';
    achievementList.forEach(item=>{const unlocked=achievementStats.unlocked.includes(item.id);const card=document.createElement('div');card.className='achievement'+(unlocked?' unlocked':'');card.innerHTML='<span class="achievement-icon">'+item.icon+'</span><span class="achievement-copy"><b>'+item.name+'</b><small>'+item.desc+'</small></span><strong>'+(unlocked?'✓':'🔒')+'</strong>';el.append(card)});
    $('statPlayed').textContent=achievementStats.played;$('statWins').textContent=achievementStats.wins;$('statStreak').textContent=achievementStats.bestStreak;
  }

  const roomCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
  const say=s=>{msg.textContent=s||''};
  const configured=()=>window.SUPABASE_URL&&window.SUPABASE_ANON_KEY;
  function connect(){if(!configured()){say('Tryb online wymaga konfiguracji Supabase.');return false}if(!client)client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);return true}
  const animalAudio={
    tiger:'https://www.mediacollege.com/downloads/sound-effects/animals/cat/tiger-01.mp3',
    mors:'https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/atoms/audio/PointLayWalrus2013_1.mp3'
  };
  let lastAnimalAudio=null;
  function soundAnimal(animal='tiger',celebration=false){
    if(!soundOn||animal==='draw')return;
    try{
      const src=animalAudio[animal]||animalAudio.tiger;
      const audio=new Audio(src);
      audio.preload='auto';
      audio.volume=celebration?1:0.9;
      // Przerywamy poprzedni efekt, żeby odgłosy ruchów nie nakładały się.
      if(lastAnimalAudio){lastAnimalAudio.pause();lastAnimalAudio.currentTime=0;}
      lastAnimalAudio=audio;
      const stopAfter=animal==='mors'?4200:3500;
      audio.addEventListener('loadedmetadata',()=>{if(animal==='mors'&&Number.isFinite(audio.duration)&&audio.duration>5)audio.currentTime=0.5;},{once:true});
      const p=audio.play();
      if(p&&typeof p.catch==='function')p.catch(err=>console.warn('Nie udało się odtworzyć pliku audio '+animal+':',err));
      setTimeout(()=>{if(lastAnimalAudio===audio){audio.pause();audio.currentTime=0;lastAnimalAudio=null;}},stopAfter);
    }catch(err){console.warn('Nie udało się uruchomić odgłosu postaci:',err);}
  }
  function sound(freq=440,duration=.09){if(!soundOn)return;try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;audioContext=audioContext||new AudioCtx();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;o.connect(g);g.connect(audioContext.destination);g.gain.setValueAtTime(.0001,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.08,audioContext.currentTime+.015);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.start();o.stop(audioContext.currentTime+duration)}catch(err){console.warn('Nie udało się odtworzyć dźwięku:',err)}}
  function updateSoundButton(){const b=$('soundBtn');if(!b)return;b.textContent=soundOn?'🔊 DŹWIĘK: WŁ.':'🔇 DŹWIĘK: WYŁ.';b.setAttribute('aria-pressed',String(soundOn));}
  function evaluate(board){for(const line of wins)if(board[line[0]]&&board[line[0]]===board[line[1]]&&board[line[1]]===board[line[2]])return{winner:board[line[0]],winning:line};return board.every(Boolean)?{winner:'draw',winning:[]}:{winner:null,winning:[]}}
  function showGame(){setup.classList.add('hidden');game.classList.remove('hidden');$('roomCode').textContent=room||'LOKALNIE';$('playerName').textContent=nick();renderAchievements();}
  const quips={
    tiger:['Tygrys mierzy. Mors niech się boi!','Pazury w gotowości. Strategia w toku.','Tygrys mówi: to pole jest moje!'],
    mors:['Mors kombinuje. I to całkiem sprytnie!','Płetwy pracują na pełnych obrotach!','Mors spokojny… aż do zwycięstwa.'],
    draw:['REMIS! Rozejm przy rybnym bufecie.','Nikt nie wygrał. Podejrzana sprawa…','Po równo! Dogrywka, zanim ostygną emocje!'],
    tigerWin:['TYGRYS GÓRĄ! Mors musi zamoczyć brodę.','Ryk zwycięstwa! Tygrys rozdaje karty!','Ale pazur! Tygrys bierze tę rundę!'],
    morsWin:['MORS WYGRYWA! Płetwy same klaszczą!','Co za fikołek! Mors ograł Tygrysa!','Zimna krew i gorące zwycięstwo Morsa!']
  };
  function commentary(kind){const list=quips[kind]||quips.tiger;const el=$('commentary');if(!el)return;let n=Math.floor(Math.random()*list.length);if(list.length>1&&n===commentIndex)n=(n+1)%list.length;commentIndex=n;el.textContent=list[n];el.dataset.mood=kind;}
  function render(){if(!current)return;cells.forEach((cell,i)=>{cell.innerHTML='';cell.classList.toggle('winning',(current.winning||[]).includes(i));const mark=current.board[i];if(mark){const im=document.createElement('img');im.src=mark===TIGER?'assets/tygrys-glowa.png':'assets/mors.png';im.alt=mark===TIGER?'Tygrys':'Mors';cell.append(im)}const canPlay=mode==='local'||(mode==='cpu'&&current.turn===TIGER)||(mode==='online'&&current.turn===role);cell.disabled=!!mark||current.status!=='playing'||!canPlay||busy});
    const w=current.winner;$('turnBanner').textContent=seriesWinner?(seriesWinner===TIGER?'🏆 TYGRYS ZDOBYWA PUCHAR!':'🏆 MORS ZDOBYWA PUCHAR!'):w==='draw'?'REMIS! NIKT NIE ODPUSZCZA 😎':w?(w===TIGER?'TYGRYS WYGRYWA! 🐯':'MORS ZGARNIA ZWYCIĘSTWO! 🦭'):(mode==='local'?'RUCH: '+(current.turn===TIGER?'TYGRYS 🐯':'MORS 🦭'):mode==='cpu'?(current.turn===TIGER?'TWOJA KOLEJ — RUSZAJ!':'MORS MYŚLI…'):current.turn===role?'TWOJA KOLEJ — RUSZAJ!':'RUCH PRZECIWNIKA…');
    $('seriesLabel').textContent=(mode==='online'?'WYNIK TEJ SESJI':'SERIA DO 3 ZWYCIĘSTW')+' · '+(scores.tiger+scores.mors)+' ROZEGRANYCH RUND';$('roleLabel').textContent=mode==='local'?'DWAJ GRACZE · JEDNO URZĄDZENIE':mode==='cpu'?'TY: TYGRYS · MORS: '+({easy:'ŁATWY',normal:'ŚREDNI',hard:'TRUDNY'}[cpuDifficulty]||'ŚREDNI'):role===TIGER?'Grasz jako TYGRYS (kółko)':'Grasz jako MORS (krzyżyk)';$('newRoundBtn').disabled=current.status!=='finished'||!!seriesWinner;$('newMatchBtn').textContent=seriesWinner?'NOWY TURNIEJ ↻':'ZERUJ TURNIEJ ↻';$('newMatchBtn').classList.toggle('hidden',mode==='online');$('tigerScore').textContent=scores.tiger;$('morsScore').textContent=scores.mors;updateSoundButton();}
  async function fetchGame(){const{data,error}=await client.from('game_sessions').select('*').eq('room_code',room).maybeSingle();if(error||!data)throw Error('Nie znaleziono pokoju. Sprawdź kod.');return data}
  function fromRow(row){const board=row.board||Array(9).fill('');return{board,turn:row.turn||TIGER,winner:row.winner||null,status:row.status||'playing',winning:evaluate(board).winning}}
  async function subscribe(){channel=client.channel('game-'+room);channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'game_sessions',filter:'room_code=eq.'+room},p=>{if(p.new){const incoming=fromRow(p.new);if(current&&current.status==='playing'&&incoming.status==='finished'&&incoming.winner&&incoming.winner!=='draw')scores[incoming.winner]++;if(mode!=='online'&&incoming.status==='finished'&&incoming.winner&&incoming.winner!=='draw'&&scores[incoming.winner]>=3)seriesWinner=incoming.winner;if(incoming.status==='finished'){commentary(incoming.winner==='draw'?'draw':incoming.winner==='tiger'?'tigerWin':'morsWin');recordFinishedGame(incoming.winner,incoming.board,mode,room)}current=incoming;render()}});const st=await new Promise(resolve=>{channel.subscribe(s=>{if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'||s==='TIMED_OUT')resolve(s)});setTimeout(()=>resolve('TIMED_OUT'),12000)});if(st!=='SUBSCRIBED')throw Error('Nie udało się połączyć na żywo. Odśwież stronę.');current=fromRow(await fetchGame());render()}
  async function createRoom(){if(!connect()||busy)return;busy=true;$('createBtn').disabled=true;say('Tworzę pokój…');try{mode='online';room=roomCode();role=document.querySelector('input[name="mySide"]:checked')?.value||TIGER;const{error}=await client.from('game_sessions').insert({room_code:room,creator_role:role,board:fresh().board,turn:TIGER,winner:null,status:'playing',guest_joined:false});if(error)throw error;current=fresh();scores={tiger:0,mors:0};seriesWinner=null;showGame();await subscribe();history.replaceState({},'',location.pathname+'?room='+room)}catch(e){say(e.message||'Coś poszło nie tak.')}finally{busy=false;$('createBtn').disabled=false}}
  async function joinRoom(code){if(!connect()||busy)return;code=(code||'').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){say('Wpisz prawidłowy, 6-znakowy kod.');return}busy=true;$('joinBtn').disabled=true;say('Szukam pokoju…');try{mode='online';room=code;const row=await fetchGame();if(row.guest_joined)throw Error('W tym pokoju jest już drugi gracz. Poproś o nowy pokój.');const{data,error}=await client.from('game_sessions').update({guest_joined:true}).eq('room_code',room).eq('guest_joined',false).select().maybeSingle();if(error)throw error;if(!data)throw Error('Ktoś właśnie dołączył. Poproś o nowy kod.');const creatorRole=row.creator_role||TIGER;role=creatorRole===TIGER?MORS:TIGER;current=fromRow(data);scores={tiger:0,mors:0};seriesWinner=null;showGame();await subscribe();history.replaceState({},'',location.pathname+'?room='+room)}catch(e){say(e.message||'Nie udało się dołączyć.');room=null;role=null}finally{busy=false;$('joinBtn').disabled=false}}
  function startLocal(which){mode=which;cpuDifficulty=$('cpuDifficulty')?.value||cpuDifficulty;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty);room=null;role=which==='cpu'?TIGER:'both';scores={tiger:0,mors:0};seriesWinner=null;current=fresh();showGame();$('roomCode').textContent=which==='cpu'?'VS KOMPUTER':'LOKALNIE';commentary('tiger');history.replaceState({},'',location.pathname);render();if(which==='cpu')say('Powodzenia! Mors nie będzie łatwym przeciwnikiem.')}
  function minimax(board,player){const r=evaluate(board);if(r.winner===MORS)return{score:10};if(r.winner===TIGER)return{score:-10};if(r.winner==='draw')return{score:0};let best={score:player===MORS?-Infinity:Infinity,index:-1};for(let i=0;i<9;i++)if(!board[i]){board[i]=player;const score=minimax(board,player===MORS?TIGER:MORS).score;board[i]='';if((player===MORS&&score>best.score)||(player===TIGER&&score<best.score))best={score,index:i}}return best}
  async function move(i){if(!current||busy||current.status!=='playing'||current.board[i])return;if(mode==='online'&&current.turn!==role)return;if(mode==='cpu'&&current.turn!==TIGER)return;busy=true;current.board[i]=mode==='local'?current.turn:role;let result=evaluate(current.board);current.winner=result.winner;current.winning=result.winning;current.status=result.winner?'finished':'playing';current.turn=result.winner?current.turn:(current.turn===TIGER?MORS:TIGER);soundAnimal(current.board[i]);render();if(mode==='online'){const{error}=await client.from('game_sessions').update({board:current.board,turn:current.turn,winner:current.winner,status:current.status}).eq('room_code',room);if(error)alert('Nie udało się zapisać ruchu. Sprawdź połączenie.')}if(current.winner){recordFinishedGame(current.winner,current.board,mode,room);if(current.winner!=='draw'){scores[current.winner]++;if(mode!=='online'&&scores[current.winner]>=3)seriesWinner=current.winner;}commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin');soundAnimal(current.winner,true);celebrate()}else commentary(current.board[i]);busy=false;render();if(mode==='cpu'&&current.status==='playing'&&current.turn===MORS){setTimeout(cpuMove,450)}}
  function cpuMove(){if(!current||current.status!=='playing'||mode!=='cpu')return;const empty=current.board.map((v,i)=>v?null:i).filter(v=>v!==null);let choice;if(cpuDifficulty==='easy'){choice=empty[Math.floor(Math.random()*empty.length)]}else if(cpuDifficulty==='normal'&&Math.random()<.35){choice=empty[Math.floor(Math.random()*empty.length)]}else{choice=minimax([...current.board],MORS).index}if(choice>=0)moveCpu(choice)}
  function moveCpu(i){if(busy||current.board[i])return;busy=true;current.board[i]=MORS;const r=evaluate(current.board);current.winner=r.winner;current.winning=r.winning;current.status=r.winner?'finished':'playing';current.turn=r.winner?MORS:TIGER;soundAnimal(MORS);if(current.winner){recordFinishedGame(current.winner,current.board,mode,room);if(current.winner!=='draw'){scores[current.winner]++;if(scores[current.winner]>=3)seriesWinner=current.winner;}commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin');celebrate()}else commentary(MORS);busy=false;render()}
  function celebrate(){document.body.classList.remove('celebrate');void document.body.offsetWidth;document.body.classList.add('celebrate');setTimeout(()=>document.body.classList.remove('celebrate'),1200)}
  async function newRound(){if(!current||current.status!=='finished'||busy||seriesWinner)return;busy=true;const next=fresh();if(mode==='online'){const{error}=await client.from('game_sessions').update({board:next.board,turn:TIGER,winner:null,status:'playing'}).eq('room_code',room);if(error)alert('Nie udało się rozpocząć rewanżu.')}current=next;commentary('tiger');busy=false;render()}
  document.querySelectorAll('input[name="mySide"]').forEach(r=>r.addEventListener('change',()=>{document.querySelectorAll('.side-option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));}));
  $('createBtn').addEventListener('click',createRoom);$('joinBtn').addEventListener('click',()=>joinRoom($('roomInput').value));$('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom(e.target.value)});$('roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));cells.forEach(c=>c.addEventListener('click',()=>move(+c.dataset.cell)));$('newRoundBtn').addEventListener('click',newRound);$('newMatchBtn').addEventListener('click',()=>{if(mode==='online'){say('Nowy turniej rozpocznijcie po uzgodnieniu z przeciwnikiem.');return}scores={tiger:0,mors:0};seriesWinner=null;current=fresh();commentary('tiger');render();});
  $('copyBtn').addEventListener('click',async()=>{const url=location.origin+location.pathname+'?room='+room;try{await navigator.clipboard.writeText(url);$('copyBtn').textContent='SKOPIOWANO ✓';setTimeout(()=>$('copyBtn').textContent='KOPIUJ LINK ↗',1800)}catch{prompt('Skopiuj link:',url)}});
  $('leaveBtn').addEventListener('click',()=>{if(channel)client.removeChannel(channel);location.href=location.pathname});$('cpuBtn').addEventListener('click',()=>startLocal('cpu'));$('localBtn').addEventListener('click',()=>startLocal('local'));$('soundBtn').addEventListener('click',e=>{e.preventDefault();soundOn=!soundOn;localStorage.setItem('tkm_sound',soundOn?'on':'off');updateSoundButton();if(soundOn)soundAnimal(TIGER,true)});updateSoundButton();$('refreshLeaderboardBtn')?.addEventListener('click',loadLeaderboard);loadLeaderboard();
  $('saveNameBtn').addEventListener('click',()=>{const n=$('nameInput').value.trim().slice(0,18);if(!n){say('Wpisz swój nick.');return}localStorage.setItem('tkm_nick',n);$('playerName').textContent=n;say('Nick zapisany na tym urządzeniu!')});$('nameInput').value=nick();
  if($('cpuDifficulty'))$('cpuDifficulty').value=cpuDifficulty;
  $('cpuDifficulty')?.addEventListener('change',e=>{cpuDifficulty=e.target.value;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty)});
  const q=new URLSearchParams(location.search).get('room');if(q){$('roomInput').value=q.toUpperCase();if(configured())joinRoom(q)}if(!configured())say('Tryb online wymaga konfiguracji Supabase. Możesz jednak grać lokalnie lub z komputerem.');
})();
