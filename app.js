(() => {
  const $ = id => document.getElementById(id);
  const setup=$('setup'), game=$('game'), msg=$('setupMessage');
  const cells=[...document.querySelectorAll('.cell')];
  const TIGER='tiger', MORS='mors';
  const CHARACTER_EMOJI={octopus:'🐙',mole:'🦫',llama:'🦙'};
  const characterAssets={tiger:'assets/hrabia-poprawek-transparent.svg',mors:'assets/mors.png',goat:'assets/koza-krzycha.jpg'};
  let selectedCharacter=localStorage.getItem('tkm_character')||'tiger';
  const characterForMark=mark=>mode==='online'?(mark===role?selectedCharacter:(remoteCharacter|| (mark===TIGER?'tiger':'mors'))):(mark===TIGER?selectedCharacter:'mors');
  const sideLabel=mark=>(characterNames[characterForMark(mark)]||'Gracz')+' '+(characterIcons[characterForMark(mark)]||'');
  let client,room=null,role=null,channel=null,current=null,remoteCharacter=null,mode='online',busy=false,cpuDifficulty=localStorage.getItem('tkm_cpu_difficulty')||'normal';
  let scores={tiger:0,mors:0},seriesWinner=null,commentIndex=0,morsIdleTimer=null,achievementStats=loadStats(),soundOn=localStorage.getItem('tkm_sound')!=='off',musicOn=localStorage.getItem('tkm_music')!=='off',startedAt=0,timer=null,audioContext=null;
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh=()=>({board:Array(9).fill(''),turn:TIGER,winner:null,status:'playing',winning:[]});
  const nick=()=>localStorage.getItem('tkm_nick')||'Gracz';
  const makeRoundId=()=> (crypto.randomUUID?crypto.randomUUID():('round-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
  let roundId=makeRoundId(),resultOverlayDismissed=false;
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
  const DAILY_KEY='tkm_daily_missions_v1';
  const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function dailyStats(){try{const saved=JSON.parse(localStorage.getItem(DAILY_KEY)||'{}');return saved.date===todayKey()?saved:{date:todayKey(),games:0,wins:0,quiz:0}}catch{return{date:todayKey(),games:0,wins:0,quiz:0}}}
  let todayMissions=dailyStats();
  function saveDaily(){localStorage.setItem(DAILY_KEY,JSON.stringify(todayMissions));renderDailyMissions()}
  function renderDailyMissions(){
    const list=$('dailyMissionList');if(!list)return;
    const missions=[
      {icon:'🎮',name:'Rozgrzej łapy',desc:'Rozegraj dowolną partię',value:todayMissions.games,goal:1},
      {icon:'🏆',name:'Zgarnij zwycięstwo',desc:'Pokonaj komputer lub gracza online',value:todayMissions.wins,goal:1},
      {icon:'🖨️',name:'Mistrz poligrafii',desc:'Zdobądź minimum 7/10 w quizie',value:todayMissions.quiz,goal:1}
    ];
    list.innerHTML='';let completed=0;
    missions.forEach(m=>{const done=m.value>=m.goal;if(done)completed++;const item=document.createElement('div');item.className='daily-mission'+(done?' done':'');const icon=document.createElement('span');icon.className='daily-mission-icon';icon.textContent=done?'✓':m.icon;const copy=document.createElement('div');copy.className='daily-mission-copy';const name=document.createElement('b');name.textContent=m.name;const desc=document.createElement('small');desc.textContent=m.desc;copy.append(name,desc);const status=document.createElement('strong');status.textContent=done?'GOTOWE':m.value+'/'+m.goal;item.append(icon,copy,status);list.append(item)});
    $('dailyProgress').textContent=completed+' / 3 MISJE';$('dailyReward').textContent=completed===3?'🏅 KOMPLET! Jesteś legendą studia.':'Nagroda: '+completed+' / 3 pieczątki';
  }

  function recordFinishedGame(result,board,gameMode,gameRoom){
    if(!result)return;
    const key=[gameMode,gameRoom||'local',roundId,board.join(''),result].join('|');
    if(achievementStats.seen.includes(key))return;
    achievementStats.seen.push(key);if(achievementStats.seen.length>100)achievementStats.seen=achievementStats.seen.slice(-100);
    todayMissions=dailyStats();todayMissions.games++;
    if((gameMode==='cpu'&&result===TIGER)||(gameMode==='online'&&result===role))todayMissions.wins++;
    saveDaily();
    achievementStats.played++;
    if(result==='draw'){achievementStats.draws++;achievementStats.streak=0;}
    else if(gameMode==='local'){achievementStats.streak=0;}
    else if((gameMode==='cpu'&&result===TIGER)||(gameMode==='online'&&result===role)){
      achievementStats.wins++;achievementStats.streak++;achievementStats.bestStreak=Math.max(achievementStats.bestStreak,achievementStats.streak);
    }else{achievementStats.losses++;achievementStats.streak=0;}
    const newly=achievementList.filter(x=>x.test(achievementStats)&&!achievementStats.unlocked.includes(x.id));
    newly.forEach(x=>achievementStats.unlocked.push(x.id));saveStats();renderAchievements();renderStickers();syncLeaderboard(result,gameMode,gameRoom,board);
    if(newly.length){const el=$('achievementNotice');if(el)el.textContent='NOWA ODZNAKA: '+newly.map(x=>x.icon+' '+x.name).join(' · ');celebrate();}renderMorsClub();
  }

  const PLAYER_ID_KEY='tkm_player_id_v1', RANK_STATS_KEY='tkm_rank_stats_v1';
  function playerId(){let id=localStorage.getItem(PLAYER_ID_KEY);if(!id){id=(crypto.randomUUID?crypto.randomUUID():('tkm-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(PLAYER_ID_KEY,id)}return id}
  function rankStats(){try{return Object.assign({played:0,wins:0,losses:0,draws:0,seen:[]},JSON.parse(localStorage.getItem(RANK_STATS_KEY)||'{}'))}catch{return{played:0,wins:0,losses:0,draws:0,seen:[]}}}
  const LEADERBOARD_URL='https://script.google.com/macros/s/AKfycbxA24BQOkFe3LVBFwFCR1Q9AattnidtJP1YRxUHELO4nsBWZ63C6qM4U9nwnlG8xlqfcA/exec';
  async function syncLeaderboard(result,gameMode,gameRoom,board){
    if(!['online','cpu'].includes(gameMode))return;
    const won=(gameMode==='cpu'&&result===TIGER)||(gameMode==='online'&&result===role);
    const lost=result!=='draw'&&!won;
    const stats=rankStats(), key=[gameMode,gameRoom||'cpu',roundId,board.join(''),result,role||''].join('|');
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


  const STICKER_KEY='tkm_stickers_v1', FORTUNE_KEY='tkm_fortune_v1';
  const stickerList=[
    {id:'first-game',icon:'🎮',name:'Pierwszy krok',desc:'Pierwsza rozegrana partia'},
    {id:'first-win',icon:'🏆',name:'Pogromca',desc:'Pierwsze zwycięstwo'},
    {id:'hat-trick',icon:'🔥',name:'Hat-trick',desc:'Trzy wygrane'},
    {id:'hot-streak',icon:'⚡',name:'Nie do zatrzymania',desc:'Seria pięciu zwycięstw'},
    {id:'veteran',icon:'🎖️',name:'Weteran',desc:'Dziesięć rozegranych partii'},
    {id:'peace',icon:'🤝',name:'Dyplomata',desc:'Partia zakończona remisem'},
    {id:'champion',icon:'👑',name:'Legenda',desc:'Dziesięć zwycięstw'},
    {id:'quiz-master',icon:'🖨️',name:'Mistrz poligrafii',desc:'Minimum 7/10 w quizie'},
    {id:'fortune-spin',icon:'🎡',name:'Szczęśliwy obrót',desc:'Zakreć Kołem Fortuny'}
  ];
  function unlockedStickers(){try{return JSON.parse(localStorage.getItem(STICKER_KEY)||'[]')}catch{return[]}}
  function renderStickers(){
    const grid=$('stickerGrid');if(!grid)return;const got=new Set([...unlockedStickers(),...achievementStats.unlocked]);
    const cards=stickerList.map(s=>({...s,unlocked:got.has(s.id)}));
    if(cards.some(s=>s.unlocked&& !unlockedStickers().includes(s.id)))localStorage.setItem(STICKER_KEY,JSON.stringify(cards.filter(s=>s.unlocked).map(s=>s.id)));
    grid.innerHTML='';cards.forEach(s=>{const el=document.createElement('div');el.className='sticker'+(s.unlocked?' earned':'');const icon=document.createElement('span');icon.textContent=s.unlocked?s.icon:'🔒';const name=document.createElement('b');name.textContent=s.unlocked?s.name:'Nieodkryta';const desc=document.createElement('small');desc.textContent=s.unlocked?s.desc:'Zagraj, aby ją zdobyć';el.append(icon,name,desc);grid.append(el)});
    $('stickerCount').textContent=cards.filter(s=>s.unlocked).length+' / '+cards.length;
  }
  function unlockSticker(id){const got=new Set(unlockedStickers());got.add(id);localStorage.setItem(STICKER_KEY,JSON.stringify([...got]));renderStickers();renderMorsClub()}
  function clubProgress(){
    const ids=new Set([...achievementStats.unlocked,...unlockedStickers()]);
    return {count:ids.size,total:stickerList.length,ready:ids.size>=3};
  }
  function renderMorsClub(){
    const el=$('morsClubCount');if(!el)return;
    const p=clubProgress(),fill=$('morsClubFill');
    el.textContent=p.count+' / '+p.total+' odznak';
    $('morsClubStatus').textContent=p.ready?'NIESPODZIANKA ODBLOKOWANA! Mors jest pod wrażeniem.':'Jeszcze '+Math.max(0,3-p.count)+' do morsowej niespodzianki.';
    if(fill)fill.style.width=Math.min(100,p.count/p.total*100)+'%';
    $('morsRewardTitle').textContent=p.ready?'🎉 Odblokowano morsową niespodziankę!':'🎁 Morsowa niespodzianka jest jeszcze zamknięta';
    $('morsRewardText').textContent=p.ready?'Napisz do studia, pokaż swój dyplom i zapytaj o dostępne naklejki Morsa lub bonus do zamówienia. Studio potwierdzi aktualną nagrodę.':'Zdobądź 3 odznaki, a odblokujesz możliwość zapytania studia o naklejki Morsa lub bonus do zamówienia.';
    $('morsRewardPanel').classList.toggle('unlocked',p.ready);
  }
  function diplomaTitle(){
    const p=clubProgress();
    if(achievementStats.wins>=10)return 'LEGENDA POJEDYNKÓW';
    if(achievementStats.bestStreak>=5)return 'POSTRACH PLANSZY';
    if(p.count>=7)return 'MISTRZ ABSURDU';
    if(p.count>=3)return 'AMBASADOR MORSOWEGO CHAOSU';
    if(achievementStats.played>=1)return 'ADEPT DWÓCH PROMILI ABSURDU';
    return 'KANDYDAT NA ABSURDYSTĘ';
  }
  function createDiplomaCanvas(){
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=990;
    const ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,1400,990);
    g.addColorStop(0,'#fff5a6');g.addColorStop(.52,'#fffdf4');g.addColorStop(1,'#ffd9e9');
    ctx.fillStyle=g;ctx.fillRect(0,0,1400,990);
    ctx.strokeStyle='#211f20';ctx.lineWidth=18;ctx.strokeRect(34,34,1332,922);
    ctx.lineWidth=4;ctx.setLineDash([12,10]);ctx.strokeRect(62,62,1276,866);ctx.setLineDash([]);
    ctx.textAlign='center';ctx.fillStyle='#211f20';
    ctx.font='900 42px Arial';ctx.fillText('STUDIO ZIMNEGO SKŁADU',700,145);
    ctx.font='900 108px Arial';ctx.fillText('DYPLOM ABSURDU',700,305);
    ctx.font='900 112px Arial';ctx.fillStyle='#e52d83';ctx.fillText('🏅',700,465);
    ctx.fillStyle='#211f20';ctx.font='800 38px Arial';ctx.fillText('niniejszym nadaje tytuł:',700,555);
    ctx.font='900 66px Arial';ctx.fillStyle='#087d91';ctx.fillText(diplomaTitle(),700,655);
    ctx.fillStyle='#211f20';ctx.font='700 34px Arial';ctx.fillText('dla: '+nick(),700,735);
    ctx.font='700 25px Arial';ctx.fillText('Rozegrane partie: '+achievementStats.played+'   •   Wygrane: '+achievementStats.wins+'   •   Odznaki: '+clubProgress().count,700,805);
    ctx.font='900 25px Arial';ctx.fillText('MORS POTWIERDZA. HRABIA MA ZASTRZEŻENIA.',700,885);
    return canvas;
  }
  function downloadDiploma(){
    const canvas=createDiplomaCanvas(),a=document.createElement('a');
    a.download='dyplom-absurdu-'+nick().toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'.png';
    a.href=canvas.toDataURL('image/png');a.click();
  }
  function shareDiploma(){
    const p=clubProgress();
    const message='Mors oficjalnie nadał mi tytuł: '+diplomaTitle()+'! Mam '+p.count+' odznak w Kółko, Krzyżyk i Dwa Promile Absurdu. A Ty? 🦭🏅';
    shareOnFacebook(message);
  }
  function contactMors(){
    const p=clubProgress();
    const message='Cześć! Wpadłem do gry Kółko, Krzyżyk i Dwa Promile Absurdu. Mój nick: '+nick()+'. Mam '+p.count+' odznak i tytuł: '+diplomaTitle()+'. Chciałbym zapytać o morsową niespodziankę / ofertę druku.';
    const opened=window.open('https://m.me/61588530162365','_blank','noopener,noreferrer');
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(message).then(()=>say('Wiadomość skopiowana — wklej ją w otwartym Messengerze.')).catch(()=>prompt('Skopiuj wiadomość do Messengera:',message));
    else prompt('Skopiuj wiadomość do Messengera:',message);
    if(!opened)say('Messenger zablokowany przez przeglądarkę. Otwórz go przyciskiem i wklej przygotowaną wiadomość.');
  }

  const fortunePrizes=[
    {icon:'⭐',name:'Klient: „zrób większe”',desc:'Pokaż palcami, jak duże jest „trochę większe”. Mors i tak poprosi o jeszcze 2 mm.'},
    {icon:'🦭',name:'Płetwa grafika',desc:'Wymyśl w 10 sekund hasło reklamowe dla morsiej budki z goframi. Ma się rymować z CMYK.'},
    {icon:'🎨',name:'CMYKowy zawrót głowy',desc:'Wymień cztery składowe CMYK bez zaglądania do internetu. Mors sprawdza!' },
    {icon:'☕',name:'Kawa operatora',desc:'Zrób minę człowieka, który właśnie usłyszał: „wysłałem plik w Wordzie, może być?”'},
    {icon:'🐯',name:'Hrabia kontruje',desc:'Powiedz z kamienną twarzą: „to już ostatnia poprawka”. Hrabia Poprawek parska śmiechem.'},
    {icon:'🖨️',name:'Spad czy nie spad?',desc:'Pokaż rękami, gdzie kończy się format netto, a zaczyna spad. Bez używania słowa „no”.'},
    {icon:'✨',name:'Brief z kosmosu',desc:'Wymyśl absurdalne zlecenie dla studia: np. wizytówki dla UFO albo baner dla yeti.'},
    {icon:'🍬',name:'KRÓWKOWY JACKPOT SZS!',desc:'Wygrywasz garść krówek z nadrukiem Studio Zimnego Składu! Zrób zrzut ekranu wyniku i napisz do nas na Messengerze — wyślemy słodką nagrodę razem z Twoim zamówieniem.'}
  ];
  function fortuneDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function renderFortune(){
    let saved={};try{saved=JSON.parse(localStorage.getItem(FORTUNE_KEY)||'{}')||{}}catch{}
    const done=saved.date===fortuneDate(),wheel=$('fortuneWheel'),button=$('spinFortuneBtn'),claim=$('fortuneClaimLink');
    if(claim)claim.hidden=!(done&&saved.prizeIndex===7);
    if(wheel&&done&&Number.isFinite(saved.rotation)){wheel.style.transition='none';wheel.style.transform='rotate('+saved.rotation+'deg)'}
    button.disabled=done;button.textContent=done?'WRÓĆ JUTRO PO KOLEJNY OBRÓT':'ZAKRĘĆ KOŁEM ABSURDU!';
    $('fortuneResult').textContent=done?(saved.prize||'Dziś już zakręcono kołem!'):'Koło czeka na pierwszy obrót…';
    $('fortuneNote').textContent=done?'Dzisiejsza niespodzianka jest już Twoja.':'Jedno losowanie dziennie. Wynik zapisze się na tym urządzeniu.';
  }

  $('closeCandyJackpot')?.addEventListener('click',()=>{$('candyJackpot').hidden=true;document.body.classList.remove('jackpot-open')});
  function fortuneTickSequence(){
    // Krótkie „klik” przy kolejnych polach — odstępy rosną, gdy koło zwalnia.
    const gaps=[65,70,75,80,85,95,105,120,135,155,180,210,245,285,330,380,430,480];
    let elapsed=0;
    gaps.forEach((gap,i)=>{
      elapsed+=gap;
      window.setTimeout(()=>{if(soundOn)sound(720+(i%3)*95,.035)},elapsed);
    });
  }
  function fortuneFinishSound(){
    if(!soundOn)return;
    sound(880,.16);
    window.setTimeout(()=>{if(soundOn)sound(1175,.22)},130);
    window.setTimeout(()=>{if(soundOn)sound(1568,.3)},280);
  }
  function spinFortune(){
    let saved={};try{saved=JSON.parse(localStorage.getItem(FORTUNE_KEY)||'{}')||{}}catch{}
    if(saved.date===fortuneDate())return;
    const wheel=$('fortuneWheel'),button=$('spinFortuneBtn'),result=$('fortuneResult'),note=$('fortuneNote'),stage=document.querySelector('.fortune-wheel-stage');const jackpot=$('candyJackpot');
    const index=Math.floor(Math.random()*fortunePrizes.length),p=fortunePrizes[index];
    const center=index*45+22.5,rotation=2160+(360-center),prize=p.icon+' '+p.name+' — '+p.desc;
    button.disabled=true;button.textContent='MORS KRĘCI…';stage?.classList.add('spinning');result.textContent='Trwa losowanie. Nie podglądać, to uczciwy chaos!';fortuneTickSequence();
    note.textContent='Koza Krzycha pilnuje, żeby nikt nie oszukiwał.';
    if(wheel){wheel.style.transition='none';wheel.style.transform='rotate(0deg)';void wheel.offsetWidth;wheel.style.transition='transform 4.6s cubic-bezier(.12,.72,.12,1)';wheel.style.transform='rotate('+rotation+'deg)'}
    window.setTimeout(()=>{
      localStorage.setItem(FORTUNE_KEY,JSON.stringify({date:fortuneDate(),prize,prizeIndex:index,rotation}));
      result.textContent=prize;fortuneFinishSound();stage?.classList.remove('spinning');const claim=$('fortuneClaimLink');if(claim)claim.hidden=index!==7;if(index===7&&jackpot){jackpot.hidden=false;document.body.classList.add('jackpot-open');window.setTimeout(()=>{jackpot.hidden=true;document.body.classList.remove('jackpot-open')},7500)}button.textContent='WRÓĆ JUTRO PO KOLEJNY OBRÓT';
      note.textContent='Wylosowano! Mors zatwierdza tę decyzję, Koza Krzycha nie zgłasza reklamacji.';
      unlockSticker('fortune-spin');
    },4700);
  }
  const printQuiz=[
    {q:'Co oznacza skrót CMYK?',a:['Czarny, Magenta, Yellow, Khaki','Cyan, Magenta, Yellow, Key (czarny)','Czerwony, Miętowy, Żółty, Kobalt'],c:1,why:'To cztery podstawowe farby w druku procesowym.'},
    {q:'Jaka rozdzielczość jest typowym punktem wyjścia dla zdjęć do druku?',a:['Około 300 dpi w docelowym rozmiarze','72 dpi zawsze wystarczy','1200 dpi dla każdego zdjęcia'],c:0,why:'Najczęściej celujemy w około 300 dpi w rzeczywistym rozmiarze.'},
    {q:'Po co dodaje się spady?',a:['Żeby plik ważył więcej','Żeby uniknąć białych krawędzi po przycięciu','Żeby kolory były bardziej nasycone'],c:1,why:'Spad wychodzi poza linię cięcia i zabezpiecza krawędź.'},
    {q:'Który format najlepiej zachowuje wektorowe logo?',a:['JPG','BMP','SVG lub PDF wektorowy'],c:2,why:'Wektor można skalować bez typowej utraty ostrości.'},
    {q:'Co to jest raster?',a:['Obraz z pikseli','Rodzaj papieru ozdobnego','Maszyna do bigowania'],c:0,why:'Raster składa się z pikseli — powiększanie może ujawnić ich strukturę.'},
    {q:'Co oznacza „4+0” w opisie druku?',a:['Cztery strony zadrukowane','Kolorowy druk z jednej strony, druga bez druku','Cztery kolory po obu stronach'],c:1,why:'Pierwsza cyfra opisuje awers, druga rewers.'},
    {q:'Do czego służą znaczniki cięcia?',a:['Pokazują miejsce przycięcia arkusza','Oznaczają najlepszy kolor','Ustawiają kolejność stron'],c:0,why:'Pomagają określić linię cięcia.'},
    {q:'Jaki papier jest zwykle bardziej sztywny przy tej samej gramaturze: kreda czy niepowlekany?',a:['Zawsze niepowlekany','Zawsze kreda','To zależy od rodzaju i parametrów papieru'],c:2,why:'Sztywność zależy od wielu cech papieru, nie tylko od nazwy.'},
    {q:'Co warto zrobić z fontami przed przekazaniem otwartego projektu?',a:['Zamienić tekst na krzywe lub dołączyć fonty zgodnie z wymaganiami','Zmienić wszystkie na Comic Sans','Usunąć tekst'],c:0,why:'Krzywe lub poprawnie dołączone fonty ograniczają ryzyko podmiany kroju.'},
    {q:'Klient przysyła logo w małym JPG i chce baner 3 × 2 m. Co robisz?',a:['Powiększasz 800 razy i modlisz się','Prosisz o plik wektorowy lub lepsze źródło','Drukujesz i liczysz, że nikt nie zauważy'],c:1,why:'Najlepiej zdobyć oryginalny wektor lub materiał w odpowiedniej jakości.'}
  ];
  let quizIndex=0,quizPoints=0,quizLocked=false;
  function startPrintQuiz(){quizIndex=0;quizPoints=0;quizLocked=false;$('quizStart').classList.add('hidden');$('quizResult').classList.add('hidden');$('quizPlay').classList.remove('hidden');renderPrintQuiz();}
  function renderPrintQuiz(){const item=printQuiz[quizIndex];$('quizProgress').textContent='PYTANIE '+(quizIndex+1)+' / '+printQuiz.length;$('quizScore').textContent='PUNKTY: '+quizPoints;$('quizTrackFill').style.width=((quizIndex+1)/printQuiz.length*100)+'%';$('quizQuestion').textContent=item.q;$('quizFeedback').textContent='';$('quizNextBtn').classList.add('hidden');const wrap=$('quizOptions');wrap.innerHTML='';item.a.forEach((answer,i)=>{const b=document.createElement('button');b.type='button';b.className='quiz-option';b.textContent=String.fromCharCode(65+i)+'. '+answer;b.addEventListener('click',()=>answerPrintQuiz(i));wrap.append(b)});quizLocked=false;}
  function answerPrintQuiz(choice){if(quizLocked)return;quizLocked=true;const item=printQuiz[quizIndex],buttons=[...$('quizOptions').children];buttons.forEach((b,i)=>{b.disabled=true;if(i===item.c)b.classList.add('correct');if(i===choice&&choice!==item.c)b.classList.add('wrong')});$('quizFeedback').textContent=(choice===item.c?'✓ DOBRZE! ':'✗ OJ, MORS BY TO SPRAWDZIŁ. ')+item.why;if(choice===item.c)quizPoints++;$('quizScore').textContent='PUNKTY: '+quizPoints;$('quizNextBtn').textContent=quizIndex===printQuiz.length-1?'POKAŻ WYNIK →':'NASTĘPNE PYTANIE →';$('quizNextBtn').classList.remove('hidden');}
  function finishPrintQuiz(){if(quizPoints>=7){todayMissions=dailyStats();todayMissions.quiz=1;saveDaily();unlockSticker('quiz-master')}const levels=quizPoints>=9?['🏆','LEGENDARNY MISTRZ DRUKU','Masz poligrafię w małym palcu. Mors prosi o autograf.']:quizPoints>=7?['🥇','OPERATOR PEŁNĄ GĘBĄ','Bardzo solidna robota. Hrabia Poprawek oddaje Ci próbnik kolorów.']:quizPoints>=5?['🖨️','OGARNIACZ DRUKARNI','Jest potencjał! Jeszcze kilka kaw i będzie perfekcja.']:['🦭','POMOCNIK OD SPINACZY','Spokojnie, praktyka czyni mistrza. Mors też kiedyś mylił spady z kanapkami.'];$('quizPlay').classList.add('hidden');$('quizResult').classList.remove('hidden');$('quizResultIcon').textContent=levels[0];$('quizResultTitle').textContent=levels[1];$('quizResultText').textContent=levels[2];$('quizFinalScore').textContent=quizPoints+' / '+printQuiz.length+' PUNKTÓW';}
  function nextPrintQuiz(){if(quizIndex<printQuiz.length-1){quizIndex++;renderPrintQuiz()}else finishPrintQuiz();}

  const GAME_URL='https://studiozimnegoskladu-max.github.io/tygrys-kontra-mors/';
  function shareOnFacebook(message,extraUrl){
    const url=extraUrl||GAME_URL;
    const share='https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)+'&quote='+encodeURIComponent(message);
    window.open(share,'_blank','noopener,noreferrer,width=720,height=620');
  }
  function copyLeadMessage(){
    const message='Cześć! Właśnie sprawdziłem grę Kółko, Krzyżyk i Dwa Promile Absurdu od Studio Zimnego Składu. Mam pytanie o projekt / druk. Czy mogę podesłać szczegóły?';
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(message).then(()=>say('Wiadomość skopiowana! Wklej ją w Messengerze do Studia.')).catch(()=>prompt('Skopiuj wiadomość do Studia:',message));}
    else prompt('Skopiuj wiadomość do Studia:',message);
  }
  const roomCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
  const say=s=>{msg.textContent=s||''};
  const configured=()=>window.SUPABASE_URL&&window.SUPABASE_ANON_KEY;
  function connect(){if(!configured()){say('Tryb online wymaga konfiguracji Supabase.');return false}if(!window.supabase?.createClient){say('Nie udało się załadować biblioteki połączenia online. Odśwież stronę lub zagraj lokalnie.');return false}if(!client)client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY);return true}
  // Odblokowanie Web Audio po pierwszym geście użytkownika (ważne zwłaszcza na Androidzie/iOS).
  document.addEventListener('pointerdown',()=>{
    if(!soundOn)return;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      audioContext=audioContext||new AudioCtx();
      if(audioContext.state==='suspended')audioContext.resume().catch(err=>console.warn('Nie udało się odblokować audio:',err));
    }catch(err){console.warn('Nie udało się przygotować audio:',err);}
  },{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&soundOn&&audioContext?.state==='suspended'){
      audioContext.resume().catch(err=>console.warn('Nie udało się wznowić audio:',err));
    }
  });
  // Oryginalne, generowane w przeglądarce efekty postaci — bez zewnętrznych plików.
  let lastAnimalAudio=[];
  function soundAnimal(animal='tiger',celebration=false){
    if(!soundOn||animal==='draw')return;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      audioContext=audioContext||new AudioCtx();
      if(audioContext.state==='suspended')audioContext.resume();
      // Ucinamy poprzedni efekt, aby odgłosy ruchów nie nakładały się.
      lastAnimalAudio.forEach(node=>{try{node.stop?.();node.disconnect?.()}catch{}});
      lastAnimalAudio=[];
      const now=audioContext.currentTime;
      const master=audioContext.createGain();
      master.gain.setValueAtTime(celebration?.22:.16,now);
      master.connect(audioContext.destination);
      const addVoice=(wave,from,to,start,duration,filterType='lowpass',cutoff=1800)=>{
        const osc=audioContext.createOscillator();
        const filter=audioContext.createBiquadFilter();
        const amp=audioContext.createGain();
        osc.type=wave;filter.type=filterType;filter.frequency.setValueAtTime(cutoff,now+start);
        osc.frequency.setValueAtTime(from,now+start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(35,to),now+start+duration*.72);
        amp.gain.setValueAtTime(.0001,now+start);
        amp.gain.linearRampToValueAtTime(1,now+start+.025);
        amp.gain.exponentialRampToValueAtTime(.0001,now+start+duration);
        osc.connect(filter);filter.connect(amp);amp.connect(master);
        osc.start(now+start);osc.stop(now+start+duration+.02);
        lastAnimalAudio.push(osc,filter,amp);
      };
      if(animal==='mors'){
        // Mors: piskliwy, przerysowany wrzask — trzy krótkie, falujące „iiii-ła!”.
        addVoice('sawtooth',1250,2050,0,.22,'bandpass',2100);
        addVoice('sine',1750,1050,.19,.28,'bandpass',1900);
        addVoice('sawtooth',1450,2250,.52,.25,'bandpass',2400);
        addVoice('sine',2100,1250,.75,.34,'bandpass',2200);
        addVoice('triangle',900,1500,1.12,.32,'bandpass',1700);
      }else{
        // Hrabia: głupkowaty, ludzki okrzyk „HA-ŁO?!” zamiast zwierzęcego ryku.
        addVoice('sawtooth',185,125,.0,.32,'bandpass',850);
        addVoice('triangle',390,240,.0,.3,'bandpass',1250);
        addVoice('sawtooth',145,95,.38,.48,'bandpass',720);
        addVoice('triangle',310,170,.38,.45,'bandpass',1050);
        addVoice('sine',520,260,.72,.18,'lowpass',1000);
      }
      const total=animal==='mors'?1.55:1.05;
      master.gain.setValueAtTime(celebration?.22:.16,now);
      master.gain.setValueAtTime(.0001,now+total);
      setTimeout(()=>{lastAnimalAudio.forEach(node=>{try{node.disconnect?.()}catch{}});lastAnimalAudio=[];try{master.disconnect()}catch{}},(total+.2)*1000);
    }catch(err){console.warn('Nie udało się uruchomić odgłosu postaci:',err);}
  }
  function sound(freq=440,duration=.09){if(!soundOn)return;try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;audioContext=audioContext||new AudioCtx();if(audioContext.state==='suspended')audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;o.connect(g);g.connect(audioContext.destination);g.gain.setValueAtTime(.0001,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.08,audioContext.currentTime+.015);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.start();o.stop(audioContext.currentTime+duration)}catch(err){console.warn('Nie udało się odtworzyć dźwięku:',err)}}
  function updateSoundButton(){const b=$('soundBtn');if(b){b.textContent=soundOn?'🔊 DŹWIĘK: WŁ.':'🔇 DŹWIĘK: WYŁ.';b.setAttribute('aria-pressed',String(soundOn));}const m=$('musicBtn');if(m){m.textContent=musicOn?'🎵 MUZYKA: WŁ.':'🎵 MUZYKA: WYŁ.';m.setAttribute('aria-pressed',String(musicOn));}}
  function startBackgroundMusic(){const player=$('backgroundMusic');if(!player||!musicOn)return;if(!player.dataset.trimEndBound){player.addEventListener('timeupdate',()=>{if(Number.isFinite(player.duration)&&player.duration>2&&player.currentTime>=player.duration-2){player.currentTime=0;}});player.dataset.trimEndBound='1';}player.volume=.24;const attempt=player.play();if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{});}
  function setMusicEnabled(enabled){musicOn=!!enabled;localStorage.setItem('tkm_music',musicOn?'on':'off');const player=$('backgroundMusic');if(player){if(musicOn)startBackgroundMusic();else player.pause();}updateSoundButton();}
  function evaluate(board){for(const line of wins)if(board[line[0]]&&board[line[0]]===board[line[1]]&&board[line[1]]===board[line[2]])return{winner:board[line[0]],winning:line};return board.every(Boolean)?{winner:'draw',winning:[]}:{winner:null,winning:[]}}
  function setScoreCharacter(card,character){
    if(!card)return;const name=characterNames[character]||'Gracz';const icon=characterIcons[character]||'🐯';
    card.querySelector('b').textContent=name.toUpperCase();
    const img=card.querySelector('img');if(img){img.style.display=CHARACTER_EMOJI[character]?'none':'';if(!CHARACTER_EMOJI[character]){img.src=characterAssets[character]||characterAssets.mors;img.alt=name;}}
    let badge=card.querySelector('.score-custom-icon');
    if(CHARACTER_EMOJI[character]){if(!badge){badge=document.createElement('span');badge.className='score-custom-icon';card.insertBefore(badge,card.querySelector('div'));}badge.textContent=icon;}else if(badge)badge.remove();
  }
  function updateOnlineCharacters(){
    if(mode!=='online'||!role)return;
    const ownCard=document.querySelector(role===TIGER?'.tiger-score':'.mors-score');
    const otherCard=document.querySelector(role===TIGER?'.mors-score':'.tiger-score');
    setScoreCharacter(ownCard,selectedCharacter);
    setScoreCharacter(otherCard,remoteCharacter||(role===TIGER?'mors':'tiger'));
  }
  function syncPresenceCharacters(){
    if(!channel||mode!=='online')return;
    const state=channel.presenceState();let found=null;
    Object.entries(state).forEach(([key,entries])=>{if(key!==String(role)&&Array.isArray(entries)&&entries.length){const meta=entries[entries.length-1];if(meta&&characterNames[meta.character])found=meta.character;}});
    remoteCharacter=found;updateOnlineCharacters();render();
  }
  function showGame(){resultOverlayDismissed=false;setup.classList.add('hidden');game.classList.remove('hidden');$('roomCode').textContent=room||'LOKALNIE';$('playerName').textContent=nick();if(mode==='online'){updateOnlineCharacters()}else{const ownCard=document.querySelector('.tiger-score');setScoreCharacter(ownCard,selectedCharacter);setScoreCharacter(document.querySelector('.mors-score'),'mors');}renderAchievements();newPrintBrief();}
  const printBriefs=[
    {title:'NA WCZORAJ, ALE TANIO',text:'Klient chce 5000 ulotek, projekt, druk i dostawę. Termin? Najlepiej 10 minut temu.'},
    {title:'MORS I WIELKI BANER',text:'Baner 2 × 1 metr. Ma być widoczny z kosmosu, ale plik klient wysłał w rozdzielczości znaczka pocztowego.'},
    {title:'TAJEMNICZE CMYK',text:'Klient twierdzi, że granat to przecież prawie żółty. Hrabia Poprawek już szuka próbnika kolorów.'},
    {title:'NAKLEJKI BEZ KOŃCA',text:'Jedna naklejka próbna przerodziła się w zamówienie na dziesięć tysięcy. Mors odpala ploter!'},
    {title:'LOGO W 5 MINUT',text:'„Mam tylko małe poprawki”. Po chwili przychodzi 37 wiadomości i zdjęcie logo zrobione kalkulatorem.'},
    {title:'PAPIEROWA KATASTROFA',text:'Maszyna ruszyła, papier jest, kawa też. Brakuje tylko pliku, który klient obiecał wysłać wczoraj.'},
    {title:'PROJEKT IDEALNY',text:'Klient chce większe, mniejsze, bardziej widoczne i mniej rzucające się w oczy. Powodzenia, graficy!'},
    {title:'MISTRZ USZLACHETNIEŃ',text:'Złocenie, lakier, tłoczenie i brokat. Mors mówi, że da się zrobić. Hrabia Poprawek pyta: na kiedy?'}
  ];
  function newPrintBrief(){
    const brief=printBriefs[Math.floor(Math.random()*printBriefs.length)];
    const title=$('briefTitle'),body=$('briefText');
    if(title)title.textContent=brief.title;
    if(body)body.textContent=brief.text;
  }
  const characterNames={tiger:'Hrabia Poprawek',mors:'Mors',goat:'Koza Krzycha',octopus:'Ośmiornica Drukarka',mole:'Kret Operator',llama:'Lama Drama'};
  const characterIcons={tiger:'🐯',mors:'🦭',goat:'🐐',octopus:'🐙',mole:'🦫',llama:'🦙'};
  const characterQuips={
    goat:{move:['Koza Krzycha melduje: kopyto postawione, proszę nie regulować odbiorników.','Mee-e-eega ruch! Nawet Hrabia musi poprawić koronę.','Krzychu, to było Twoje kopyto czy pieczątka?','Koza Krzycha skacze po planszy. Kontrola jakości uciekła.','Beee-zdyskusyjny ruch. Komisja kopyt zatwierdza.','Koza Krzycha mówi: ja tu tylko przyszłam skubać zwycięstwo.','Uwaga na rogi! Strategia weszła na pełnej.','Kopytko w pole, rozum na urlopie.'],win:['KOZA KRZYCHA WYGRYWA! Reszta może iść skubać trawę.','BEEE-zapelacyjna wygrana! Krzychu, odbierz puchar!','Koza Krzycha rozniosła planszę. Dosłownie prawie ją zjadła.','Kopyta górą! Hrabia składa oficjalny protest.']},
    octopus:{move:['Ośmiornica Drukarka ma osiem pomysłów naraz!','Macka w ruch! Kolejny kolor na planszy!','Osiem rąk, zero wymówek. Drukujemy zwycięstwo!'],win:['OSIEM MACEK I PEŁNA KONTROLA!','Drukarka wypluła zwycięstwo w najwyższej jakości!']},
    mole:{move:['Kret Operator wierci… i zajmuje pole!','Podziemna strategia właśnie weszła na planszę.','Kret zna każdy skrót. Nawet pod planszą!'],win:['KRET WYGRYWA! To był ruch z głębi strategii!','Wykopane zwycięstwo! Operator zna się na robocie!']},
    llama:{move:['Lama Drama robi wejście. Będzie gorąco!','Uwaga, plucie… znaczy, precyzyjny ruch!','Lama ma dziś dramatycznie dobry plan!'],win:['LAMA DRAMA! Finał godny owacji na stojąco!','Ależ drama! Lama zgarnia zwycięstwo!']}
  };
  const quips={
    tiger:['Hrabia Poprawek mierzy. Mors niech się boi!','Pazury w gotowości. Strategia w toku.','Hrabia Poprawek mówi: to pole jest moje!'],
    mors:['Mors kombinuje. I to całkiem sprytnie!','Płetwy pracują na pełnych obrotach!','Mors spokojny… aż do zwycięstwa.'],
    draw:['REMIS! Rozejm przy rybnym bufecie.','Nikt nie wygrał. Podejrzana sprawa…','Po równo! Dogrywka, zanim ostygną emocje!'],
    tigerWin:['HRABIA POPRAWEK GÓRĄ! Mors musi zamoczyć brodę.','Ryk zwycięstwa! Hrabia Poprawek rozdaje karty!','Ale poprawka! Hrabia Poprawek bierze tę rundę!'],
    morsWin:['MORS WYGRYWA! Płetwy same klaszczą!','Co za fikołek! Mors ograł Hrabiego Poprawek!','Zimna krew i gorące zwycięstwo Morsa!']
  };
  const secretEvents=[
    {title:'MORS PRZEJĄŁ PLANSZĘ!',text:'Przerwa techniczna. Mors sprawdza, czy kratki są wystarczająco mokre.'},
    {title:'KOZA KRZYCHA WCHODZI DO AKCJI!',text:'BEEE! Komisja kopyt uznała ten ruch za podejrzanie elegancki.'},
    {title:'HRABIA MA FOCHA',text:'Hrabia Poprawek odwrócił się plecami. Prosi o kontakt wyłącznie przez pełnomocnika.'},
    {title:'AWARIA DRUKARNI!',text:'Na planszę spadła pieczątka DO POPRAWY. Prosimy zachować spokój i pliki otwarte.'},
    {title:'KONTROLA JAKOŚCI',text:'Mors sprawdził planszę. Wynik kontroli: za dużo ambicji, za mało ryb.'},
    {title:'DWA PROMILE ABSURDU!',text:'Wykryto niebezpieczne stężenie głupoty. Rozgrywka może być kontynuowana.'},
    {title:'NIEAUTORYZOWANY KLEKS',text:'Ktoś rozlał CMYK. Hrabia twierdzi, że to nowy trend w projektowaniu.'},
    {title:'KOZA ZGŁASZA REKLAMACJĘ',text:'Powód: plansza nie zawiera wystarczającej ilości siana. Reklamacja odrzucona.'}
  ];
  let lastSecretEventKey='',secretEventTimer=null;
  function maybeSecretEvent(board,finished=false){
    if(!board)return;
    const key=(room||mode)+'|'+board.join('');
    if(key===lastSecretEventKey)return;
    lastSecretEventKey=key;
    if(Math.random()>(finished ? 0.34 : 0.12))return;
    const event=secretEvents[Math.floor(Math.random()*secretEvents.length)],box=$('secretEvent');
    if(!box)return;
    $('secretEventTitle').textContent=event.title;$('secretEventText').textContent=event.text;
    box.classList.remove('hidden','event-pop');void box.offsetWidth;box.classList.add('event-pop');
    if(secretEventTimer)clearTimeout(secretEventTimer);
    secretEventTimer=window.setTimeout(()=>box.classList.add('hidden'),5200);
  }
  function setMorsPose(pose){
    const art=$('morsReaction');if(!art)return;
    const poses={sleep:1,music:2,run:3,panic:4,angry:5,shout:6,paint:7,clap:8,gesture:9,fierce:10,sad:11,celebrate:12,wave:13,sit:14,think:15};
    const value=poses[pose]?pose:'wave';
    const poseIndex=poses[value]-1;
    art.dataset.pose=String(poses[value]);
    art.style.backgroundImage="url('assets/mors-"+String(poseIndex).padStart(2,'0')+".png?v=20261108-moods')";
    const labels={sleep:'Mors zasypia',music:'Mors słucha muzyki',run:'Mors biegnie',panic:'Mors jest zaskoczony',angry:'Mors jest wściekły',shout:'Mors krzyczy',paint:'Mors maluje',clap:'Mors klaszcze',gesture:'Mors pokazuje gest',fierce:'Mors robi groźną minę',sad:'Mors jest smutny',celebrate:'Mors świętuje',wave:'Mors macha na powitanie',sit:'Mors siedzi i czeka',think:'Mors się zastanawia'};
    art.setAttribute('aria-label',labels[value]);
  }
  function scheduleMorsIdle(){
    if(morsIdleTimer)clearTimeout(morsIdleTimer);
    if(game.classList.contains('hidden')||!current||current.status!=='playing')return;
    morsIdleTimer=window.setTimeout(()=>{
      if(!current||current.status!=='playing'||game.classList.contains('hidden'))return;
      setMorsPose('sleep');
      const copy=$('commentaryText');if(copy)copy.textContent='ZZZ… Obudźcie mnie, jak ktoś wreszcie wygra.';
      const box=$('commentary');if(box){box.dataset.mood='idle';box.classList.remove('comic-line-pop');void box.offsetWidth;box.classList.add('comic-line-pop');}
    },22000);
  }
  function commentary(kind,character){
    const el=$('commentary');if(!el)return;
    const custom=characterQuips[character];
    const list=custom?(kind==='tigerWin'||kind==='morsWin'?custom.win:custom.move):(quips[kind]||quips.tiger);
    let n=Math.floor(Math.random()*list.length);if(list.length>1&&n===commentIndex)n=(n+1)%list.length;commentIndex=n;
    const copy=$('commentaryText');if(copy)copy.textContent=list[n];else el.textContent=list[n];
    el.dataset.mood=kind;el.dataset.character=character||'classic';
    const moodLabels={tiger:'HRABIA POPRAWEK W AKCJI',mors:'MORS KOMENTUJE',draw:'REMIS — NIKT NIE PĘKA',tigerWin:'HRABIA ŚWIĘTUJE · MORS MA FOCHA',morsWin:'MORS ŚWIĘTUJE ZWYCIĘSTWO'};
    const mood=$('commentaryMood');if(mood)mood.textContent=moodLabels[kind]||(characterNames[character]||'EKIPA SZS')+' KOMENTUJE';
    let pose='wave';
    if(kind==='draw')pose='think';
    else if(kind==='tigerWin')pose='sad';
    else if(kind==='morsWin')pose='celebrate';
    else if(character==='mors'||kind==='mors')pose=['clap','paint','gesture'][Math.floor(Math.random()*3)];
    else if(character==='tiger'||kind==='tiger')pose=['run','fierce','think'][Math.floor(Math.random()*3)];
    else pose=['wave','gesture','sit'][Math.floor(Math.random()*3)];
    setMorsPose(pose);
    el.classList.remove('comic-line-pop');void el.offsetWidth;el.classList.add('comic-line-pop');
    scheduleMorsIdle();
  }
  function render(){if(!current)return;cells.forEach((cell,i)=>{cell.innerHTML='';cell.classList.toggle('winning',(current.winning||[]).includes(i));const mark=current.board[i];if(mark){const character=characterForMark(mark);if(CHARACTER_EMOJI[character]){const avatar=document.createElement('span');avatar.className='board-character';avatar.textContent=CHARACTER_EMOJI[character];cell.append(avatar)}else{const im=document.createElement('img');im.className='board-avatar';im.src=characterAssets[character]||characterAssets.mors;im.alt=characterNames[character]||'Maskotka SZS';cell.append(im)}}const canPlay=mode==='local'||(mode==='cpu'&&current.turn===TIGER)||(mode==='online'&&current.turn===role);cell.disabled=!!mark||current.status!=='playing'||!canPlay||busy});
    const w=current.winner;game.classList.toggle('round-finished',current.status==='finished');game.classList.toggle('round-draw',w==='draw');game.classList.toggle('series-won',!!seriesWinner);$('turnBanner').textContent=seriesWinner?('🏆 '+sideLabel(seriesWinner).toUpperCase()+' ZDOBYWA PUCHAR!'):w==='draw'?'REMIS! NIKT NIE ODPUSZCZA 😎':w?(sideLabel(w).toUpperCase()+' WYGRYWA!'):(mode==='local'?'RUCH: '+sideLabel(current.turn):mode==='cpu'?(current.turn===TIGER?'TWOJA KOLEJ — RUSZAJ!':'MORS MYŚLI…'):current.turn===role?'TWOJA KOLEJ — RUSZAJ!':'RUCH PRZECIWNIKA…');
    $('seriesLabel').textContent=(mode==='online'?'WYNIK TEJ SESJI':'SERIA DO 3 ZWYCIĘSTW')+' · '+(scores.tiger+scores.mors)+' ROZEGRANYCH RUND';$('roleLabel').textContent=mode==='local'?'DWAJ GRACZE · JEDNO URZĄDZENIE':mode==='cpu'?'TY: '+sideLabel(TIGER)+' · MORS: '+({easy:'ŁATWY',normal:'ŚREDNI',hard:'TRUDNY'}[cpuDifficulty]||'ŚREDNI'):'Grasz jako '+sideLabel(role)+' ('+(role===TIGER?'kółko':'krzyżyk')+')';$('newRoundBtn').disabled=current.status!=='finished'||!!seriesWinner;$('newMatchBtn').textContent=seriesWinner?'NOWY TURNIEJ ↻':'ZERUJ TURNIEJ ↻';$('newMatchBtn').classList.toggle('hidden',mode==='online');$('tigerScore').textContent=scores.tiger;$('morsScore').textContent=scores.mors;const resultOverlay=$('roundResultOverlay');if(resultOverlay){const resultTitle=$('roundResultTitle'),resultText=$('roundResultText'),resultIcon=$('roundResultIcon');if(current.status==='finished'){if(current.winner==='draw'){if(resultTitle)resultTitle.textContent='REMIS!';if(resultText)resultText.textContent='Nikt nie odpuszcza. Plansza potrzebuje dogrywki, a Mors — kawy.';if(resultIcon)resultIcon.textContent='🤝';}else{if(resultTitle)resultTitle.textContent=sideLabel(current.winner).toUpperCase()+' WYGRYWA!';if(resultText)resultText.textContent=seriesWinner?'PUCHAR WĘDRUJE DO ZWYCIĘZCY!':mode==='local'?'Runda rozstrzygnięta. Druga strona już szykuje protest.':(mode==='cpu'&&current.winner===TIGER)||(mode==='online'&&current.winner===role)?'Piękna robota! Hrabia właśnie sprawdza regulamin.':'Tym razem przeciwnik był górą. Rewanż czeka!';if(resultIcon)resultIcon.textContent=seriesWinner?'🏆':'💥';}}resultOverlay.hidden=current.status!=='finished'||resultOverlayDismissed;}updateSoundButton();}
  async function fetchGame(){const{data,error}=await client.from('game_sessions').select('*').eq('room_code',room).maybeSingle();if(error||!data)throw Error('Nie znaleziono pokoju. Sprawdź kod.');return data}
  function fromRow(row){const board=row.board||Array(9).fill('');return{board,turn:row.turn||TIGER,winner:row.winner||null,status:row.status||'playing',winning:evaluate(board).winning}}
  async function subscribe(){channel=client.channel('game-'+room,{config:{presence:{key:String(role)}}});channel.on('presence',{event:'sync'},syncPresenceCharacters);channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'game_sessions',filter:'room_code=eq.'+room},p=>{if(p.new){const wasPlaying=current?.status==='playing';const incoming=fromRow(p.new);if(wasPlaying&&incoming.status==='finished'&&incoming.winner&&incoming.winner!=='draw')scores[incoming.winner]++;if(current?.status==='finished'&&incoming.status==='playing')roundId=makeRoundId();if(wasPlaying&&incoming.status==='finished'){commentary(incoming.winner==='draw'?'draw':incoming.winner==='tiger'?'tigerWin':'morsWin');recordFinishedGame(incoming.winner,incoming.board,mode,room);maybeSecretEvent(incoming.board,true)}else if(current&&incoming.board.join('')!==current.board.join('')){const lastMark=incoming.board.find((v,i)=>v!==current.board[i]);if(lastMark)commentary(lastMark,characterForMark(lastMark));maybeSecretEvent(incoming.board,false)}current=incoming;render()}});const st=await new Promise(resolve=>{channel.subscribe(s=>{if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'||s==='TIMED_OUT')resolve(s)});setTimeout(()=>resolve('TIMED_OUT'),12000)});if(st!=='SUBSCRIBED')throw Error('Nie udało się połączyć na żywo. Odśwież stronę.');const presenceResult=await channel.track({role,character:selectedCharacter,nick:nick(),joined_at:new Date().toISOString()});if(presenceResult==='error')console.warn('Nie udało się udostępnić maskotki w pokoju.');current=fromRow(await fetchGame());syncPresenceCharacters();render()}
  async function createRoom(){if(!connect()||busy)return;roundId=makeRoundId();busy=true;$('createBtn').disabled=true;say('Tworzę pokój…');try{mode='online';remoteCharacter=null;room=roomCode();role=document.querySelector('input[name="mySide"]:checked')?.value||TIGER;const{error}=await client.from('game_sessions').insert({room_code:room,creator_role:role,board:fresh().board,turn:TIGER,winner:null,status:'playing',guest_joined:false});if(error)throw error;current=fresh();scores={tiger:0,mors:0};seriesWinner=null;showGame();await subscribe();history.replaceState({},'',location.pathname+'?room='+room)}catch(e){say(e.message||'Coś poszło nie tak.')}finally{busy=false;$('createBtn').disabled=false}}
  async function joinRoom(code){if(!connect()||busy)return;roundId=makeRoundId();code=(code||'').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code)){say('Wpisz prawidłowy, 6-znakowy kod.');return}busy=true;$('joinBtn').disabled=true;say('Szukam pokoju…');try{mode='online';remoteCharacter=null;room=code;const row=await fetchGame();if(row.guest_joined)throw Error('W tym pokoju jest już drugi gracz. Poproś o nowy pokój.');const{data,error}=await client.from('game_sessions').update({guest_joined:true}).eq('room_code',room).eq('guest_joined',false).select().maybeSingle();if(error)throw error;if(!data)throw Error('Ktoś właśnie dołączył. Poproś o nowy kod.');const creatorRole=row.creator_role||TIGER;role=creatorRole===TIGER?MORS:TIGER;current=fromRow(data);scores={tiger:0,mors:0};seriesWinner=null;showGame();await subscribe();history.replaceState({},'',location.pathname+'?room='+room)}catch(e){say(e.message||'Nie udało się dołączyć.');room=null;role=null}finally{busy=false;$('joinBtn').disabled=false}}
  function startLocal(which){roundId=makeRoundId();remoteCharacter=null;mode=which;cpuDifficulty=$('cpuDifficulty')?.value||cpuDifficulty;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty);room=null;role=which==='cpu'?TIGER:'both';scores={tiger:0,mors:0};seriesWinner=null;current=fresh();showGame();$('roomCode').textContent=which==='cpu'?'VS KOMPUTER':'LOKALNIE';commentary('tiger',selectedCharacter);history.replaceState({},'',location.pathname);render();if(which==='cpu')say('Powodzenia! Mors nie będzie łatwym przeciwnikiem.')}
  function minimax(board,player){const r=evaluate(board);if(r.winner===MORS)return{score:10};if(r.winner===TIGER)return{score:-10};if(r.winner==='draw')return{score:0};let best={score:player===MORS?-Infinity:Infinity,index:-1};for(let i=0;i<9;i++)if(!board[i]){board[i]=player;const score=minimax(board,player===MORS?TIGER:MORS).score;board[i]='';if((player===MORS&&score>best.score)||(player===TIGER&&score<best.score))best={score,index:i}}return best}
  async function move(i){if(!current||busy||current.status!=='playing'||current.board[i])return;if(mode==='online'&&current.turn!==role)return;if(mode==='cpu'&&current.turn!==TIGER)return;busy=true;current.board[i]=mode==='local'?current.turn:role;let result=evaluate(current.board);current.winner=result.winner;current.winning=result.winning;current.status=result.winner?'finished':'playing';current.turn=result.winner?current.turn:(current.turn===TIGER?MORS:TIGER);soundAnimal(current.board[i]);render();if(mode==='online'){const{error}=await client.from('game_sessions').update({board:current.board,turn:current.turn,winner:current.winner,status:current.status}).eq('room_code',room);if(error)alert('Nie udało się zapisać ruchu. Sprawdź połączenie.')}if(current.winner){recordFinishedGame(current.winner,current.board,mode,room);if(current.winner!=='draw'){scores[current.winner]++;if(mode!=='online'&&scores[current.winner]>=3)seriesWinner=current.winner;}commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin',current.winner==='draw'?null:characterForMark(current.winner));soundAnimal(current.winner,true);celebrate();maybeSecretEvent(current.board,true)}else{commentary(current.board[i],characterForMark(current.board[i]));maybeSecretEvent(current.board,false)}busy=false;render();if(mode==='cpu'&&current.status==='playing'&&current.turn===MORS){setTimeout(cpuMove,450)}}
  function cpuMove(){if(!current||current.status!=='playing'||mode!=='cpu')return;const empty=current.board.map((v,i)=>v?null:i).filter(v=>v!==null);let choice;if(cpuDifficulty==='easy'){choice=empty[Math.floor(Math.random()*empty.length)]}else if(cpuDifficulty==='normal'&&Math.random()<.35){choice=empty[Math.floor(Math.random()*empty.length)]}else{choice=minimax([...current.board],MORS).index}if(choice>=0)moveCpu(choice)}
  function moveCpu(i){if(busy||current.board[i])return;busy=true;current.board[i]=MORS;const r=evaluate(current.board);current.winner=r.winner;current.winning=r.winning;current.status=r.winner?'finished':'playing';current.turn=r.winner?MORS:TIGER;soundAnimal(MORS);if(current.winner){recordFinishedGame(current.winner,current.board,mode,room);if(current.winner!=='draw'){scores[current.winner]++;if(scores[current.winner]>=3)seriesWinner=current.winner;}commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin');celebrate();maybeSecretEvent(current.board,true)}else{commentary(MORS,'mors');maybeSecretEvent(current.board,false)}busy=false;render()}
  function celebrate(){document.body.classList.remove('celebrate');void document.body.offsetWidth;document.body.classList.add('celebrate');setTimeout(()=>document.body.classList.remove('celebrate'),1200)}
  async function newRound(){if(!current||current.status!=='finished'||busy||seriesWinner)return;resultOverlayDismissed=false;roundId=makeRoundId();busy=true;const next=fresh();try{if(mode==='online'){const{error}=await client.from('game_sessions').update({board:next.board,turn:TIGER,winner:null,status:'playing'}).eq('room_code',room);if(error)throw error}current=next;commentary('tiger')}catch(error){alert('Nie udało się rozpocząć rewanżu. Sprawdź połączenie i spróbuj ponownie.');console.warn(error)}finally{busy=false;render()}}
  $('introEnterBtn')?.addEventListener('click',()=>{$('introScreen').classList.add('intro-dismissed');});
  $('roundResultClose')?.addEventListener('click',()=>{resultOverlayDismissed=true;$('roundResultOverlay').hidden=true;});
  // Delikatny odgłos papierowego stempla dla kliknięć interfejsu; respektuje przełącznik dźwięku.
  document.addEventListener('click',event=>{const control=event.target.closest('button.btn, a.btn');if(!control||control.id==='soundBtn'||control.classList.contains('cell')||control.disabled)return;sound(260,.045);window.setTimeout(()=>sound(390,.035),38);});
  $('spinFortuneBtn')?.addEventListener('click',spinFortune);$('quizStartBtn')?.addEventListener('click',startPrintQuiz);$('quizNextBtn')?.addEventListener('click',nextPrintQuiz);$('quizAgainBtn')?.addEventListener('click',()=>{$('quizResult').classList.add('hidden');$('quizStart').classList.remove('hidden');$('quizTrackFill').style.width='0%';});
  document.querySelectorAll('input[name="character"]').forEach(r=>{r.checked=r.value===selectedCharacter;r.addEventListener('change',()=>{selectedCharacter=r.value;localStorage.setItem('tkm_character',selectedCharacter);document.querySelectorAll('.character-option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));});});
  document.querySelectorAll('input[name="mySide"]').forEach(r=>r.addEventListener('change',()=>{document.querySelectorAll('.side-option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));}));
  $('createBtn').addEventListener('click',createRoom);$('joinBtn').addEventListener('click',()=>joinRoom($('roomInput').value));$('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom(e.target.value)});$('roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));cells.forEach(c=>c.addEventListener('click',()=>move(+c.dataset.cell)));$('newRoundBtn').addEventListener('click',newRound);$('newMatchBtn').addEventListener('click',()=>{if(mode==='online'){say('Nowy turniej rozpocznijcie po uzgodnieniu z przeciwnikiem.');return}scores={tiger:0,mors:0};seriesWinner=null;resultOverlayDismissed=false;roundId=makeRoundId();current=fresh();commentary('tiger');render();});
  $('shareInviteBtn')?.addEventListener('click',()=>shareOnFacebook('Rzucam Ci wyzwanie! Wybierz swoją maskotkę i spróbuj mnie pokonać w Kółko, Krzyżyk i Dwa Promile Absurdu. 🐯🦭'));
  $('copyLeadBtn')?.addEventListener('click',copyLeadMessage);
  $('downloadDiplomaBtn')?.addEventListener('click',downloadDiploma);
  $('shareDiplomaBtn')?.addEventListener('click',shareDiploma);
  $('morsMessengerBtn')?.addEventListener('click',e=>{e.preventDefault();contactMors()});
  $('shareResultBtn')?.addEventListener('click',()=>{const result=current?.winner?(current.winner==='draw'?'Remis!':sideLabel(current.winner)+' wygrywa!'):'Dołącz do pojedynku!';shareOnFacebook('Mój pojedynek w Kółko, Krzyżyk i Dwa Promile Absurdu: '+result+' Wynik serii: Hrabia Poprawek '+scores.tiger+' : '+scores.mors+' Mors. Dasz radę lepiej? 🏆')});
  $('shareQuizBtn')?.addEventListener('click',()=>shareOnFacebook('Mój wynik w teście Mistrza Drukarni: '+quizPoints+' / '+printQuiz.length+' punktów! Sprawdź, czy znasz się na poligrafii. 🖨️'));
  $('copyBtn').addEventListener('click',async()=>{const url=location.origin+location.pathname+'?room='+room;try{await navigator.clipboard.writeText(url);$('copyBtn').textContent='SKOPIOWANO ✓';setTimeout(()=>$('copyBtn').textContent='KOPIUJ LINK ↗',1800)}catch{prompt('Skopiuj link:',url)}});
  $('leaveBtn').addEventListener('click',()=>{if(channel)client.removeChannel(channel);location.href=location.pathname});$('cpuBtn').addEventListener('click',()=>startLocal('cpu'));$('localBtn').addEventListener('click',()=>startLocal('local'));$('soundBtn').addEventListener('click',e=>{e.preventDefault();soundOn=!soundOn;localStorage.setItem('tkm_sound',soundOn?'on':'off');updateSoundButton();if(soundOn)soundAnimal(TIGER,true)});$('musicBtn')?.addEventListener('click',e=>{e.preventDefault();setMusicEnabled(!musicOn)});document.addEventListener('pointerdown',()=>{if(musicOn)startBackgroundMusic()},{once:true});$('introEnterBtn')?.addEventListener('click',()=>{if(musicOn)startBackgroundMusic()});updateSoundButton();$('refreshLeaderboardBtn')?.addEventListener('click',loadLeaderboard);$('newBriefBtn')?.addEventListener('click',newPrintBrief);
  // Morsowy Park Absurdu — minigry używają wyłącznie oryginalnego assets/mors.png.
  function initMiniArcade(){
    const colors=[{id:'cyan',name:'CYAN',hex:'#00a9ce'},{id:'magenta',name:'MAGENTA',hex:'#ec268f'},{id:'yellow',name:'ŻÓŁTY',hex:'#ffe600'},{id:'black',name:'CZARNY',hex:'#211f24'}];
    let paintTimer=null,paintTime=20,paintScore=0,paintTarget='cyan';
    const paintPlay=$('paintPlay'),paintChoices=$('paintChoices'),paintPrompt=$('paintPrompt'),paintStatus=$('paintStatus');
    function nextPaint(){
      paintTarget=colors[Math.floor(Math.random()*colors.length)].id;
      paintPrompt.textContent='ŁAP '+colors.find(c=>c.id===paintTarget).name+'!';
      const opts=[...colors].sort(()=>Math.random()-.5);
      paintChoices.innerHTML=opts.map(c=>'<button type="button" class="paint-chip paint-'+c.id+'" data-paint="'+c.id+'" aria-label="'+c.name+'"></button>').join('');
    }
    $('paintStart')?.addEventListener('click',()=>{
      clearInterval(paintTimer);paintScore=0;paintTime=20;paintPlay.classList.remove('hidden');$('paintStart').classList.add('hidden');paintStatus.textContent='Wynik: 0 · Zostało 20 sekund';nextPaint();
      paintTimer=setInterval(()=>{paintTime--;paintStatus.textContent='Wynik: '+paintScore+' · Zostało '+paintTime+' sekund';if(paintTime<=0){clearInterval(paintTimer);paintChoices.innerHTML='';paintPrompt.textContent='KONIEC FARBOBRANIA!';paintStatus.textContent='Mors zdobył '+paintScore+' punktów. '+(paintScore>=12?'Ale chlupnęło CMYK-iem!':'Trening czyni drukarza.');$('paintStart').textContent='JESZCZE RAZ ↻';$('paintStart').classList.remove('hidden')}},1000);
    });
    paintChoices?.addEventListener('click',e=>{const b=e.target.closest('[data-paint]');if(!b||paintTime<=0)return;if(b.dataset.paint===paintTarget){paintScore+=2;paintStatus.textContent='DOBRZE! +2 · Wynik: '+paintScore;paintPlay.classList.remove('comic-good','comic-bad');void paintPlay.offsetWidth;paintPlay.classList.add('comic-good'); }else{paintScore=Math.max(0,paintScore-1);paintStatus.textContent='OJOJ! ZŁY KOLOR · Wynik: '+paintScore;paintPlay.classList.remove('comic-good','comic-bad');void paintPlay.offsetWidth;paintPlay.classList.add('comic-bad')}nextPaint()});
    // Fontowy Bałagan: 3 znaki mają tę samą kreskę, jeden jest typograficznym intruzem.
    let fontRound=0,fontScore=0,fontOdd=0,fontLocked=false,fontNextTimer=null;
    const fontPlay=$('fontPlay'),fontChoices=$('fontChoices'),fontStatus=$('fontStatus');
    function nextFont(){
      fontOdd=Math.floor(Math.random()*4);
      const glyphs=['A','R','S','Z','M','K','O','Ł','W','Ż'];
      const letter=glyphs[Math.floor(Math.random()*glyphs.length)];
      fontChoices.innerHTML=Array.from({length:4},(_,i)=>'<button type="button" class="font-sample '+(i===fontOdd?'font-intruder':'font-normal')+'" data-font="'+i+'">'+letter+'</button>').join('');
      fontStatus.textContent='Runda '+(fontRound+1)+' z 8 · Punkty: '+fontScore;
    }
    $('fontStart')?.addEventListener('click',()=>{clearTimeout(fontNextTimer);fontLocked=false;fontRound=0;fontScore=0;fontPlay.classList.remove('hidden','comic-good','comic-bad');$('fontStart').classList.add('hidden');$('fontPrompt').textContent='ZNAJDŹ TYPOGRAFICZNEGO INTRUZA!';nextFont()});
    fontChoices?.addEventListener('click',e=>{const b=e.target.closest('[data-font]');if(!b||fontLocked)return;fontLocked=true;fontPlay.classList.remove('comic-good','comic-bad');void fontPlay.offsetWidth;if(Number(b.dataset.font)===fontOdd){fontScore++;b.classList.add('font-right');fontPlay.classList.add('comic-good')}else{b.classList.add('font-wrong');fontPlay.classList.add('comic-bad')}fontRound++;if(fontRound>=8){fontChoices.innerHTML='';$('fontPrompt').textContent=fontScore>=6?'OKO TYPOGRAFA!':'MORS WIDZIAŁ GORSZE PROJEKTY…';fontStatus.textContent='Wynik: '+fontScore+' / 8. '+(fontScore===8?'Ani jednej literowej wtopy!':'Jeszcze kilka rund i będziesz fontowym ninja.');$('fontStart').textContent='GRAM PONOWNIE ↻';$('fontStart').classList.remove('hidden')}else{fontNextTimer=setTimeout(()=>{fontLocked=false;nextFont()},260)}});
    // Morsowanie: seria 10 sygnałów do skoku, bez odruchowego klikania na ślepo.
    let iceRound=0,iceHits=0,iceReady=false,iceTimer=null,iceWindow=null,iceNextTimer=null;
    const icePlay=$('icePlay'),iceJump=$('iceJump'),icePrompt=$('icePrompt'),iceStatus=$('iceStatus');
    function finishIce(){clearTimeout(iceTimer);clearTimeout(iceWindow);clearTimeout(iceNextTimer);iceReady=false;iceJump.disabled=true;icePrompt.textContent='KONIEC MORSOWANIA!';$('iceWater').textContent='🏆 ❄️ 🏆';iceStatus.textContent='Udane skoki: '+iceHits+' / 10. '+(iceHits>=8?'Lodowy kozak!':'Mors zaleca rozgrzewkę.');$('iceStart').textContent='JESZCZE JEDNA KĄPIEL ↻';$('iceStart').classList.remove('hidden')}
    function scheduleIce(){if(iceRound>=10){finishIce();return}icePrompt.textContent='CZEKAJ…';$('iceWater').textContent='🌊  🧊  🌊';iceJump.disabled=true;iceReady=false;iceTimer=setTimeout(()=>{iceReady=true;icePlay.classList.remove('comic-good','comic-bad');icePrompt.textContent='TERAZ! SKACZ!!!';$('iceWater').textContent='💦  🧊  💦';iceJump.disabled=false;iceStatus.textContent='SKOK, PŁETWO!';iceWindow=setTimeout(()=>{if(!iceReady)return;iceReady=false;iceRound++;iceJump.disabled=true;iceStatus.textContent='CHLUP! Przegapiona kra. '+iceRound+'/10';icePlay.classList.remove('comic-good','comic-bad');void icePlay.offsetWidth;icePlay.classList.add('comic-bad');scheduleIce()},1050)},650+Math.random()*1450)}
    $('iceStart')?.addEventListener('click',()=>{clearTimeout(iceTimer);clearTimeout(iceWindow);clearTimeout(iceNextTimer);iceRound=0;iceHits=0;icePlay.classList.remove('hidden');$('iceStart').classList.add('hidden');iceStatus.textContent='10 lodowych przeszkód. Czekaj na sygnał!';scheduleIce()});
    iceJump?.addEventListener('click',()=>{if(!iceReady)return;iceReady=false;clearTimeout(iceWindow);iceRound++;iceHits++;iceJump.disabled=true;iceStatus.textContent='PIĘKNY SKOK! '+iceRound+'/10';icePlay.classList.remove('comic-good','comic-bad');void icePlay.offsetWidth;icePlay.classList.add('comic-good');$('iceWater').textContent='💥  🦭  💥';iceNextTimer=setTimeout(scheduleIce,420)});
  }

  initMiniArcade();
  renderDailyMissions();renderStickers();renderMorsClub();renderFortune();loadLeaderboard();
  $('saveNameBtn').addEventListener('click',()=>{const n=$('nameInput').value.trim().slice(0,18);if(!n){say('Wpisz swój nick.');return}localStorage.setItem('tkm_nick',n);$('playerName').textContent=n;say('Nick zapisany na tym urządzeniu!')});$('nameInput').value=nick();
  if($('cpuDifficulty'))$('cpuDifficulty').value=cpuDifficulty;
  $('cpuDifficulty')?.addEventListener('change',e=>{cpuDifficulty=e.target.value;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty)});
  const q=new URLSearchParams(location.search).get('room');if(q){$('roomInput').value=q.toUpperCase();if(configured())joinRoom(q)}if(!configured())say('Tryb online wymaga konfiguracji Supabase. Możesz jednak grać lokalnie lub z komputerem.');
})();
