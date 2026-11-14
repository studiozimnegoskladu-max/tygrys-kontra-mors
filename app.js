(() => {
  const $ = id => document.getElementById(id);
  const setup=$('setup'), game=$('game'), msg=$('setupMessage');
  // Krytyczny przycisk pokoju podpinamy od razu, zanim uruchomią się dodatki strony.
  window.addEventListener('error',e=>{if(msg)msg.textContent='Błąd aplikacji: '+(e.message||'sprawdź konsolę przeglądarki')});
  window.addEventListener('unhandledrejection',e=>{if(msg)msg.textContent='Błąd aplikacji: '+(e.reason?.message||String(e.reason||'nieznany błąd'))});
  $('createBtn')?.addEventListener('click',()=>{createRoom().catch(e=>{console.error('Nieobsłużony błąd tworzenia pokoju:',e);if(msg)msg.textContent='Błąd tworzenia pokoju: '+(e?.message||String(e))})});
  const cells=[...document.querySelectorAll('.cell')];
  const TIGER='tiger', MORS='mors';
  const CHARACTER_EMOJI={};
  const characterAssets={tiger:'assets/hrabia-poprawek-transparent.svg',mors:'assets/mascot-mors.png',goat:'assets/koza-krzycha.jpg',bobr:'assets/mascot-bobr.png',llama:'assets/mascot-lama.png',octopus:'assets/mascot-osmiornica.png'};
  const characterAssetUrl=character=>characterAssets[character]||characterAssets.mors;
  let selectedCharacter=localStorage.getItem('tkm_character')||'tiger';if(selectedCharacter==='mole'){selectedCharacter='bobr';localStorage.setItem('tkm_character','bobr');}
  const characterForMark=mark=>mode==='online'?(mark===role?selectedCharacter:(remoteCharacter|| (mark===TIGER?'tiger':'mors'))):(mark===TIGER?selectedCharacter:'mors');
  const sideLabel=mark=>(characterNames[characterForMark(mark)]||'Gracz')+' '+(characterIcons[characterForMark(mark)]||'');
  let client,room=null,role=null,channel=null,pollTimer=null,current=null,remoteCharacter=null,mode='online',busy=false,cpuDifficulty=localStorage.getItem('tkm_cpu_difficulty')||'normal';
  let scores={tiger:0,mors:0},seriesWinner=null,commentIndex=0,morsIdleTimer=null,achievementStats=loadStats(),soundOn=localStorage.getItem('tkm_sound')!=='off',musicOn=true,soccerMusicActive=false,startedAt=0,timer=null,audioContext=null;
  // Muzyka startuje domyślnie WŁĄCZONA przy każdym nowym wejściu do aplikacji.
  localStorage.setItem('tkm_music','on');
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh=()=>({board:Array(9).fill(''),turn:TIGER,winner:null,status:'playing',winning:[]});
  const nick=()=>localStorage.getItem('tkm_nick')||'Gracz';
  const makeRoundId=()=> (crypto.randomUUID?crypto.randomUUID():('round-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
  let roundId=makeRoundId(),resultOverlayDismissed=false;
  const onlineScoredResults=new Set();
  function countOnlineWinnerOnce(winner,board){if(!winner||winner==='draw')return;const key=[room,roundId,winner,(board||[]).join('')].join('|');if(onlineScoredResults.has(key))return;onlineScoredResults.add(key);scores[winner]++;}
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


  // Dziennik Morsa — codzienny wpis wybierany automatycznie według daty.
  const morsJournalEntries=[
    {title:'Płetwa lewa, płetwa prawa',text:'Poniedziałek. Wstałem lewą płetwą. Prawa jeszcze śpi. Przegrałem dziś trzy razy w kółko i krzyżyk, ale przynajmniej mam piękne kły. Nie można mieć wszystkiego.',challenge:'Zagraj dziś jedną partię. Jeśli wygrasz, nie chwal się. Jeśli przegrasz, zwal winę na grawitację.',mood:'REFLEKSJA Z LODÓWKI'},
    {title:'Ekspert od nicnierobienia',text:'Opracowałem dziś nową metodę pracy. Najpierw patrzę na zadanie. Potem patrzę w dal. Po godzinie zadanie samo robi się mniej pilne. Jestem geniuszem.',challenge:'Zrób jedną rzecz, którą odkładasz od tygodnia. Potem odpocznij jak profesjonalista.',mood:'BADANIA WŁASNE'},
    {title:'Sprawa podejrzanej ryby',text:'Ktoś zostawił rybę bez nadzoru. Oczywiście przeprowadziłem kontrolę jakości. Wynik: ryba zniknęła, kontrola zakończona sukcesem.',challenge:'Wygraj partię z Morsikiem. Nie przyjmujemy reklamacji na poziomie trudności.',mood:'RAPORT ŚLEDCZY'},
    {title:'Nie każda plama to błąd',text:'W drukarni powiedzieli, że zrobiłem plamę. Odpowiedziałem, że to nowoczesna kompozycja. Od tamtej pory każda moja wpadka ma nazwę artystyczną.',challenge:'Odwiedź dziś quiz poligraficzny i zdobądź przynajmniej 7 punktów.',mood:'SZTUKA WSPÓŁCZESNA'},
    {title:'Dzień bez dramatu',text:'Postanowiłem dziś nie robić dramatu. Wytrzymałem jedenaście sekund. Potem ktoś powiedział, że skończyła się kawa. To był koniec mojej cierpliwości.',challenge:'Rozegraj dwie partie. Spróbuj choć raz nie komentować wyniku.',mood:'SPOKÓJ WEWNĘTRZNY'},
    {title:'Kły to nie argument',text:'Hrabia Poprawek twierdzi, że zawsze ma rację. Ja też tak twierdzę. Różnica jest taka, że ja mam kły i nie muszę tego udowadniać.',challenge:'Rzuć wyzwanie komuś znajomemu. Niech rozstrzygnie to plansza.',mood:'POJEDYNEK NA OPINIE'},
    {title:'Wielki plan na jutro',text:'Mam plan. Jutro zrobię wszystko, czego nie zrobiłem dzisiaj. Pojutrze odpocznę po tym wielkim wysiłku. Kalendarz już się boi.',challenge:'Zagraj dziś choć jedną rundę. Nie odkładaj zwycięstwa na jutro.',mood:'STRATEGIA DŁUGOFALOWA'},
    {title:'Kolor ma znaczenie',text:'Ktoś zapytał, czy widzę różnicę między cyanem a turkusem. Oczywiście. Jeden jest bardziej cyanowy, a drugi bardziej turkusowy. Proszę nie zadawać trudnych pytań przed obiadem.',challenge:'Odwiedź Morsowy Park Absurdu i sprawdź swój refleks.',mood:'KOLOROWA EKSPERTYZA'},
    {title:'Mors kontra budzik',text:'Budzik zadzwonił o szóstej. Zignorowałem go. Zadzwonił o siódmej. Zignorowałem go bardziej. O ósmej wstałem, żeby go wyłączyć. Technicznie rzecz biorąc, wygrałem.',challenge:'Zrób dziś serię trzech rozgrywek. Zobaczymy, kto ma więcej wytrwałości.',mood:'PORANNY RAPORT'},
    {title:'Instrukcja obsługi Morsa',text:'Punkt pierwszy: nie poganiać. Punkt drugi: nie zabierać ryby. Punkt trzeci: jeśli punkty pierwszy i drugi zawiodą, udawać, że to był test charakteru.',challenge:'Wybierz inną maskotkę niż zwykle i rozegraj nią partię.',mood:'DOKUMENT WEWNĘTRZNY'},
    {title:'Remis też jest wynikiem',text:'Dziś zremisowałem. Niektórzy mówią, że nikt nie wygrał. Ja mówię, że obaj przegrali ze mną, tylko jeszcze o tym nie wiedzą.',challenge:'Spróbuj dziś doprowadzić do remisu. Strategia: kontrolowany chaos.',mood:'MĄDROŚĆ PŁETWIASTA'},
    {title:'Kreatywność kontrolowana',text:'Narysowałem dziś prostą kreskę. Ktoś zapytał, czy to projekt. Odpowiedziałem: to początek wielkiej koncepcji. Potem dorysowałem drugą kreskę i podniosłem cenę.',challenge:'Zagraj partię i zakończ ją zwycięstwem. Morsowa kapituła patrzy.',mood:'DZIAŁ KREATYWNY'},
    {title:'Nie ufaj cichej drukarce',text:'Drukarka milczy. To nie znaczy, że nie planuje. Znam te urządzenia. Najpierw cisza, potem komunikat: papier zacięty. A papier leży obok.',challenge:'Zagraj dziś z komputerem na trudnym poziomie. Odważ się.',mood:'OSTRZEŻENIE TECHNICZNE'},
    {title:'Wielka teoria płetwy',text:'Uważam, że każda decyzja powinna być podejmowana po krótkiej drzemce. Niestety niektóre decyzje podejmuję w trakcie drzemki. Stąd tyle niespodzianek.',challenge:'Zrób dziś coś inaczej: wybierz nową maskotkę albo przeciwnika.',mood:'FILOZOFIA LODOWA'},
    {title:'Raport z pola bitwy',text:'Plansza była bezlitosna. Przeciwnik sprytny. Ja piękny. Bilans? Nie będziemy psuć dobrego nastroju szczegółami.',challenge:'Zaproś znajomego do pojedynku i sprawdź, czy też ma tyle uroku.',mood:'KRONIKA ZWYCIĘSTW'},
    {title:'Morsowa motywacja',text:'Pamiętaj: jeśli życie rzuca ci kłody pod płetwy, zbuduj z nich tratwę. Jeśli rzuca fakturę, przekaż ją księgowości.',challenge:'Wykonaj jedną misję dnia. Małe zwycięstwa też pachną rybą.',mood:'MOTYWACYJNY CHLUP'},
    {title:'Nie jestem uparty',text:'Nie jestem uparty. Po prostu moje zdanie jest tak dobre, że nie widzę powodu, żeby je zmieniać. To zupełnie co innego.',challenge:'Zagraj rewanż z przeciwnikiem, który ostatnio Cię pokonał.',mood:'OFICJALNE STANOWISKO'},
    {title:'Ostatnie słowo należy do Morsa',text:'Mówili, że nie dam rady. Mówili, że to niemożliwe. Mówili też, że mam przestać mówić. Tego ostatniego nie przyjąłem do wiadomości.',challenge:'Zagraj dziś trzy partie i zostaw po sobie legendę. Albo przynajmniej ślad płetwy.',mood:'MOWA KOŃCOWA'},
    {title:'Instrukcja do kawy',text:'Kawa powinna mieć instrukcję: wlać, wypić, nie zadawać pytań przed pierwszym łykiem. Zgłosiłem ten projekt do działu pilnych potrzeb.',challenge:'Zagraj dziś partię, zanim kawa wystygnie. Albo po drugiej kawie, nie oceniam.',mood:'DZIAŁ NAPOJÓW'},
    {title:'Podejrzanie dobry pomysł',text:'Wpadłem na genialny pomysł. Zapisałem go na kartce. Teraz nie mogę znaleźć kartki, ale jestem pewien, że zmieni świat.',challenge:'Wymyśl własny pseudonim gracza i zapisz go w profilu.',mood:'BURZA MÓZGU'},
    {title:'Płetwiasta elegancja',text:'Założyłem dziś muszkę. Wyglądam jak dyrektor. Nie wiem czego, ale na pewno czegoś bardzo ważnego.',challenge:'Wybierz maskotkę, której dawno nie używałeś, i wygraj nią rundę.',mood:'GARDEROBA MORSa'},
    {title:'Walka z pikselem',text:'Ktoś powiedział, że jeden piksel nic nie zmienia. Powiedziałem mu, że jeden okruszek też nic nie zmienia, dopóki nie wpadnie do klawiatury.',challenge:'Odwiedź quiz i sprawdź, czy pamiętasz podstawy przygotowania do druku.',mood:'DZIAŁ PRECYZJI'},
    {title:'Morsowa prognoza',text:'Przewiduję dziś 100 procent szans na absurd. Wiatr z północy, humor z południa, a w lodówce pusto. Sytuacja rozwojowa.',challenge:'Zagraj dziś online ze znajomym. Niech pogoda rozstrzygnie pojedynek.',mood:'METEOROLOGIA PŁETW'},
    {title:'Nie dotykać projektu',text:'Kiedy ktoś mówi „tylko mała poprawka”, chowam się pod biurko. Z doświadczenia wiem, że mała poprawka ma zwykle siedemnaście kuzynów.',challenge:'Pokonaj Hrabiego Poprawek w pojedynku. To sprawa honoru.',mood:'ALARM KOREKTORSKI'},
    {title:'Dzień wielkich odkryć',text:'Odkryłem, że lodówka świeci się w środku. To znaczy, że ktoś tam zostawił światło. Śledztwo trwa, kanapka zaginęła.',challenge:'Zrób dziś komplet trzech misji dnia. Mors patrzy z uznaniem.',mood:'NAUKA I TECHNIKA'},
    {title:'Sztuka przegrywania',text:'Przegrywanie to też sztuka. Ja na przykład potrafię przegrać z godnością, wdziękiem i bardzo długim milczeniem. Potem mówię, że plansza była krzywa.',challenge:'Jeśli dziś przegrasz, zagraj rewanż. Jeśli wygrasz, też zagraj rewanż.',mood:'AKADEMIA HONORU'},
    {title:'Poważna narada',text:'Zwołałem naradę z samym sobą. Wszyscy byli zgodni, że należy zrobić przerwę. Uchwała przyjęta jednogłośnie.',challenge:'Zaproś drugiego gracza. Narady w pojedynkę są podejrzane.',mood:'POSIEDZENIE ZARZĄDU'},
    {title:'Tajemnica spadu',text:'Spad to nie jest to, co robię z kanapy. Chociaż czasem też potrzebuję dodatkowych trzech milimetrów marginesu bezpieczeństwa.',challenge:'Zdobądź dziś co najmniej 7/10 w teście Mistrza Drukarni.',mood:'POLIGRAFIA DLA PŁETW'},
    {title:'Wielka płetwa sprawiedliwości',text:'Dziś rozdałem trzy sprawiedliwe werdykty. Dwa były dla mnie. Trzeci był dla ryby. Demokracja działa.',challenge:'Zagraj trzy partie i sprawdź, czy szczęście stoi po Twojej stronie.',mood:'TRYBUNAŁ MORSA'},
    {title:'Złota zasada',text:'Jeśli nie wiesz, co zrobić, zrób herbatę. Jeśli nadal nie wiesz, zrób drugą. Jeśli nadal nic, zapytaj Morsa. Ale licz się z odpowiedzią.',challenge:'Odwiedź Koło Absurdu i sprawdź, co dziś wylosujesz.',mood:'PORADNIK ŻYCIOWY'},
    {title:'Mors na urlopie',text:'Ogłaszam urlop od obowiązków. Będę odpoczywać aktywnie, czyli leżeć w innym miejscu niż zwykle. Proszę nie przeszkadzać.',challenge:'Zagraj jedną szybką partię. Urlop od nudy nie obowiązuje.',mood:'DZIAŁ WYPRAWKOWY'}
  ];
  const journalDate=(offset=0)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-offset);return d};
  const journalDayNumber=(date)=>Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(2026,0,1))/86400000);
  const journalIndex=(date)=>{const n=journalDayNumber(date);return ((n%morsJournalEntries.length)+morsJournalEntries.length)%morsJournalEntries.length};
  function generateMorsJournalEntry(date){
    const day=journalDayNumber(date);
    let seed=(day+1)*2654435761>>>0;
    const pick=(items)=>{seed=(seed*1664525+1013904223)>>>0;return items[seed%items.length]};
    const subjects=['drukarka','ryba','kawa','Hrabia Poprawek','lodówka','projekt','plansza','poniedziałek','płetwa','klient','piksel','spinacz'];
    const actions=['złożyła wypowiedzenie','zniknęła bez śladu','zażądała urlopu','weszła w tryb artystyczny','ogłosiła stan wyjątkowy','odmówiła współpracy','zaczęła podejrzanie mrugać','przeszła na dietę z tuszu'];
    const places=['w dziale kreatywnym','na zapleczu drukarni','pod lodem','w Morsowym Parku Absurdu','na samym środku planszy','w kolejce po święty spokój','w archiwum nieudanych pomysłów'];
    const reactions=['Nie panikowałem. Najpierw zrobiłem minę eksperta, a potem zapytałem, czy ktoś widział moją rybę.','Zwołałem komisję. Byłem ja, moje odbicie i bardzo niezadowolona kanapka.','Hrabia zaproponował trzy poprawki. Wprowadziłem czwartą: zamknąłem notes.','Uznałem, że to znak. Nie wiem czego, ale wyglądał profesjonalnie.','W raporcie wpisałem: sytuacja pod kontrolą. Raport sam uciekł.','Przez chwilę chciałem zareagować rozsądnie, ale nie miałem przy sobie odpowiedniego formularza.','Wszyscy patrzyli na mnie. Ja patrzyłem na rybę. Ryba zachowała się najbardziej dojrzale.'];
    const endings=['Wniosek? Nie każda katastrofa jest porażką. Niektóre są po prostu bardzo głośne.','Od dziś wprowadzam nową zasadę: najpierw ryba, potem decyzje.','Sprawa pozostaje otwarta, głównie dlatego, że zgubiłem klucz do szuflady.','Zapisałem to w dzienniku. Dziennik poprosił o przeniesienie.','Jutro przeprowadzę dalsze badania. Chyba że będzie drzemka.'];
    const challenges=['Zagraj dziś jedną rundę i rzuć wyzwanie komuś, kto za bardzo wierzy we własne umiejętności.','Odwiedź Morsowy Park Absurdu i sprawdź, czy masz dziś refleks godny płetwy.','Wykonaj jedną misję dnia. Mors osobiście przybije Ci mentalną pieczątkę.','Zmień maskotkę i rozegraj nią partię. Niech nastąpi płetwiasta odmiana.','Zagraj rewanż. Pamiętaj: plansza nie przyjmuje reklamacji, ale Mors wysłucha.','Wymyśl dziś własną nazwę dla małej wpadki. To pierwszy krok do wielkiej kariery.','Zaproś znajomego do gry. Samotne zwycięstwa są podejrzanie ciche.','Zajrzyj do quizu i udowodnij, że wiesz coś więcej niż to, gdzie trzyma się ryby.'];
    const moods=['RAPORT Z PŁETW','KOMISJA ABSURDU','NOTATKA SŁUŻBOWA','BADANIA TERENOWE','REFLEKSJA Z LODÓWKI','DZIAŁ KREATYWNY','ALARM MORSA'];
    const subject=pick(subjects);
    return {
      title:subject.charAt(0).toUpperCase()+subject.slice(1)+' '+pick(['i wielka tajemnica','na zakręcie','kontra rzeczywistość','w stanie krytycznym','ma dziś wolne','oraz plan awaryjny']),
      text:'Dziś '+subject+' '+pick(actions)+' '+pick(places)+'. '+pick(reactions)+' '+pick(endings),
      challenge:pick(challenges),
      mood:pick(moods)
    };
  }
  const getMorsJournalEntry=(date)=>{const n=journalDayNumber(date);return n>=0&&n<morsJournalEntries.length?morsJournalEntries[n]:generateMorsJournalEntry(date)};
  const journalDateLabel=(date)=>date.toLocaleDateString('pl-PL',{day:'numeric',month:'long',year:'numeric'});
  function renderMorsJournal(){
    const card=$('morsJournalToday'),archive=$('morsJournalArchive');
    if(!card||!archive)return;
    const today=journalDate();
    const todayBtn=$('morsJournalTodayBtn');
    function showEntry(date){
      const entry=getMorsJournalEntry(date);
      $('morsJournalDate').textContent=journalDateLabel(date);
      $('morsJournalMood').textContent=entry.mood;
      $('morsJournalTitle').textContent=entry.title;
      $('morsJournalText').textContent='„'+entry.text+'”';
      $('morsJournalChallenge').textContent=entry.challenge;
      if(todayBtn)todayBtn.hidden=date.toDateString()===today.toDateString();
      const share=$('morsJournalShare');
      if(share)share.onclick=()=>shareOnFacebook('DZIENNIK MORSA · '+journalDateLabel(date)+'\\n'+entry.title+'\\n\\n„'+entry.text+'”\\n\\nWYZWANIE: '+entry.challenge+'\\n\\nWięcej absurdów w grze Kółko, Krzyżyk i Dwa Promile Absurdu — Studio Zimnego Składu 🦭');
    }
    if(todayBtn)todayBtn.onclick=()=>showEntry(today);
    showEntry(today);
    archive.innerHTML='';
    for(let offset=1;offset<=5;offset++){
      const date=journalDate(offset),old=getMorsJournalEntry(date);
      const item=document.createElement('article');item.className='mors-journal-archive-item';
      const day=document.createElement('small');day.textContent=journalDateLabel(date);
      const title=document.createElement('b');title.textContent=old.title;
      const excerpt=document.createElement('p');excerpt.textContent=old.text;
      const open=document.createElement('button');open.type='button';open.className='mors-journal-read';open.textContent='CZYTAJ WPIS →';open.onclick=()=>{showEntry(date);card.scrollIntoView({behavior:'smooth',block:'center'});};
      item.append(day,title,excerpt,open);archive.append(item);
    }
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
    newly.forEach(x=>achievementStats.unlocked.push(x.id));saveStats();renderAchievements();renderStickers();renderDiplomas();syncLeaderboard(result,gameMode,gameRoom,board);
    if(newly.length){const el=$('achievementNotice');if(el)el.textContent='NOWA ODZNAKA: '+newly.map(x=>x.icon+' '+x.name).join(' · ');celebrate();}renderMorsClub();
  }

  const PLAYER_ID_KEY='tkm_player_id_v1', RANK_STATS_KEY='tkm_rank_stats_v1';
  function playerId(){let id=localStorage.getItem(PLAYER_ID_KEY);if(!id){id=(crypto.randomUUID?crypto.randomUUID():('tkm-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(PLAYER_ID_KEY,id)}return id}
  const MORS_CUP_TOKEN_KEY='tkm_morscup_player_token_v1';
  function morsCupPlayerToken(){let token=localStorage.getItem(MORS_CUP_TOKEN_KEY);if(!token){token=makeRoomToken();localStorage.setItem(MORS_CUP_TOKEN_KEY,token)}return token}
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
  function unlockSticker(id){const got=new Set(unlockedStickers());got.add(id);localStorage.setItem(STICKER_KEY,JSON.stringify([...got]));renderStickers();renderDiplomas();renderMorsClub()}
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
  const diplomaList=[
    {id:'first-game',icon:'🎮',name:'PIERWSZE STARCIE',desc:'Za rozegranie pierwszej partii',detail:'Oficjalnie przekraczasz próg planszowego absurdu.'},
    {id:'first-win',icon:'🏆',name:'PIERWSZA KREW',desc:'Za pierwsze zwycięstwo',detail:'Pierwszy rywal pokonany. Mors kiwa płetwą z uznaniem.'},
    {id:'hat-trick',icon:'🔥',name:'HAT-TRICK',desc:'Za trzy zwycięstwa',detail:'Trzy wygrane na koncie. Przypadek? Hrabia twierdzi, że nie.'},
    {id:'hot-streak',icon:'⚡',name:'NIE DO ZATRZYMANIA',desc:'Za serię pięciu zwycięstw',detail:'Plansza drży, przeciwnicy się pocą, Mors prosi o autograf.'},
    {id:'veteran',icon:'🎖️',name:'WETERAN PLANSZY',desc:'Za rozegranie dziesięciu partii',detail:'Dziesięć starć za Tobą. Znasz już każdy kant tej planszy.'},
    {id:'peace',icon:'🤝',name:'DYPLOMATA',desc:'Za zakończenie partii remisem',detail:'Pokój zwyciężył. Hrabia nie jest przekonany, ale podpisuje.'},
    {id:'champion',icon:'👑',name:'LEGENDA POJEDYNKÓW',desc:'Za dziesięć zwycięstw',detail:'Dziesięć zwycięstw. Tytuł legendy przyznany bez prawa odwołania.'},
    {id:'quiz-master',icon:'🖨️',name:'MISTRZ POLIGRAFII',desc:'Za wynik minimum 7/10 w quizie',detail:'CMYK nie ma przed Tobą tajemnic. Mors zatwierdza jakość.'},
    {id:'fortune-spin',icon:'🎡',name:'SZCZĘŚLIWY OBRÓT',desc:'Za zakręcenie Kołem Fortuny',detail:'Los się do Ciebie uśmiechnął. Nawet Hrabia nie wnosi poprawek.'}
  ];
  function unlockedDiplomas(){return new Set([...achievementStats.unlocked,...unlockedStickers()])}
  function renderDiplomas(){
    const grid=$('diplomaGrid');if(!grid)return;
    const got=unlockedDiplomas();grid.innerHTML='';
    diplomaList.forEach(item=>{
      const earned=got.has(item.id),card=document.createElement('article');
      card.className='earned-diploma-card'+(earned?' is-earned':'');
      const mark=document.createElement('span');mark.className='earned-diploma-mark';mark.textContent=earned?item.icon:'🔒';
      const title=document.createElement('b');title.textContent=earned?item.name:'TAJNY DYPLOM';
      const desc=document.createElement('small');desc.textContent=earned?item.desc:'Zdobądź odpowiednią odznakę, aby go odblokować.';
      card.append(mark,title,desc);
      if(earned){
        const actions=document.createElement('div');actions.className='earned-diploma-actions';
        const download=document.createElement('button');download.type='button';download.className='btn btn-dark';download.dataset.diplomaDownload=item.id;download.textContent='POBIERZ PNG ↓';
        const share=document.createElement('button');share.type='button';share.className='btn btn-facebook';share.dataset.diplomaShare=item.id;share.textContent='POCHWAL SIĘ';
        actions.append(download,share);card.append(actions);
      }
      grid.append(card);
    });
    const count=[...got].filter(id=>diplomaList.some(item=>item.id===id)).length;
    const status=$('diplomaCollectionStatus');if(status)status.textContent=count+' / '+diplomaList.length+' dyplomów zdobytych';
  }
  function createDiplomaCanvas(item){
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1272;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    // Papier certyfikatowy z lekką fakturą i ciepłym, drukarskim tłem.
    const paper=ctx.createLinearGradient(0,0,W,H);
    paper.addColorStop(0,'#fff8cf');paper.addColorStop(.48,'#fffdf4');paper.addColorStop(1,'#ffe4ed');
    ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.10;ctx.fillStyle='#211f20';
    for(let y=18;y<H;y+=34)for(let x=(y%2?12:28);x<W;x+=42)ctx.fillRect(x,y,2,2);
    ctx.globalAlpha=1;
    // Duże, nieregularne ślady farby w narożnikach.
    const splash=(color,x,y,rx,ry,rot)=>{
      ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.fillStyle=color;ctx.globalAlpha=.78;
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();
      for(let n=0;n<11;n++){const a=n*Math.PI*2/11;const r=rx*(.78+(n%3)*.12);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*ry*1.35,7+(n%4)*5,0,Math.PI*2);ctx.fill()}
      ctx.restore();ctx.globalAlpha=1;
    };
    splash('#00a9ce',95,105,112,52,-.35);splash('#ec268f',1700,115,125,58,.28);
    splash('#ffe000',105,1165,135,60,.2);splash('#252329',1700,1160,95,48,-.4);
    // Ramka drukarska i wewnętrzna linia.
    ctx.strokeStyle='#211f20';ctx.lineWidth=25;ctx.strokeRect(38,38,W-76,H-76);
    ctx.strokeStyle='#ec268f';ctx.lineWidth=5;ctx.strokeRect(68,68,W-136,H-136);
    ctx.strokeStyle='#211f20';ctx.lineWidth=2;ctx.setLineDash([10,12]);ctx.strokeRect(88,88,W-176,H-176);ctx.setLineDash([]);
    // Górna belka i sygnet studia.
    ctx.textAlign='center';ctx.fillStyle='#211f20';
    ctx.font='900 42px Arial';ctx.fillText('STUDIO ZIMNEGO SKŁADU',W/2,168);
    ctx.fillStyle='#ec268f';ctx.fillRect(560,194,680,8);
    ctx.fillStyle='#211f20';ctx.font='900 105px Arial';ctx.fillText('DYPLOM ABSURDU',W/2,330);
    ctx.font='700 27px Arial';ctx.fillStyle='#087d91';ctx.fillText('MORSOWA KAPITUŁA OSIĄGNIĘĆ  •  CERTYFIKAT OFICJALNIE NIEPOWAŻNY',W/2,382);
    // Medal z podwójną obwódką.
    const cx=W/2,cy=535;
    ctx.fillStyle='#ec268f';ctx.beginPath();ctx.moveTo(cx-52,cy+56);ctx.lineTo(cx-92,cy+190);ctx.lineTo(cx-12,cy+155);ctx.lineTo(cx+24,cy+205);ctx.lineTo(cx+48,cy+56);ctx.closePath();ctx.fill();
    ctx.fillStyle='#00a9ce';ctx.beginPath();ctx.moveTo(cx+8,cy+55);ctx.lineTo(cx+52,cy+194);ctx.lineTo(cx+88,cy+151);ctx.lineTo(cx+120,cy+181);ctx.lineTo(cx+76,cy+48);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffe000';ctx.strokeStyle='#211f20';ctx.lineWidth=12;ctx.beginPath();ctx.arc(cx,cy,112,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#fffdf4';ctx.lineWidth=7;ctx.beginPath();ctx.arc(cx,cy,91,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#211f20';ctx.font='900 86px Arial';ctx.fillText(item.icon,cx,cy+29);
    ctx.fillStyle='#211f20';ctx.font='800 35px Arial';ctx.fillText('niniejszym nadaje tytuł:',W/2,790);
    // Nazwa osiągnięcia w kolorowym polu.
    const title=item.name.toUpperCase();
    ctx.font='900 70px Arial';let titleSize=70;
    while(ctx.measureText(title).width>1450&&titleSize>42){titleSize-=2;ctx.font='900 '+titleSize+'px Arial'}
    const tw=Math.min(1510,Math.max(700,ctx.measureText(title).width+130));
    ctx.fillStyle='#ffe000';ctx.strokeStyle='#211f20';ctx.lineWidth=8;
    ctx.beginPath();ctx.roundRect((W-tw)/2,830,tw,112,18);ctx.fill();ctx.stroke();
    ctx.fillStyle='#211f20';ctx.fillText(title,W/2,907);
    ctx.font='700 38px Arial';ctx.fillText('dla: '+nick(),W/2,1010);
    ctx.font='italic 29px Arial';ctx.fillStyle='#087d91';ctx.fillText(item.detail,W/2,1060);
    ctx.font='800 24px Arial';ctx.fillStyle='#211f20';ctx.fillText('PRZYZNANO ZA: '+item.desc.toUpperCase(),W/2,1112);
    // Pieczęć kapituły w dolnym prawym rogu.
    ctx.save();ctx.translate(1480,1030);ctx.rotate(-.13);ctx.strokeStyle='#ec268f';ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,0,104,0,Math.PI*2);ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,88,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ec268f';ctx.font='900 22px Arial';ctx.fillText('MORS',0,-8);ctx.font='900 17px Arial';ctx.fillText('ZATWIERDZA',0,22);ctx.font='28px Arial';ctx.fillText('✦',0,57);ctx.restore();
    ctx.font='900 21px Arial';ctx.fillStyle='#211f20';ctx.fillText('MORS POTWIERDZA. HRABIA MA ZASTRZEŻENIA.',W/2,1190);
    ctx.font='20px Arial';ctx.fillStyle='#555';ctx.fillText('STUDIO ZIMNEGO SKŁADU  •  '+new Date().toLocaleDateString('pl-PL'),W/2,1220);
    return canvas;
  }
  function downloadDiploma(id){
    const item=diplomaList.find(x=>x.id===id);if(!item||!unlockedDiplomas().has(id))return;
    const canvas=createDiplomaCanvas(item),a=document.createElement('a');
    a.download='dyplom-'+id+'-'+nick().toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'.png';
    a.href=canvas.toDataURL('image/png');a.click();
  }
  function shareDiploma(id){
    const item=diplomaList.find(x=>x.id===id);if(!item||!unlockedDiplomas().has(id))return;
    shareOnFacebook('Mors oficjalnie nadał mi dyplom: '+item.name+'! Zdobyłem go w grze Kółko, Krzyżyk i Dwa Promile Absurdu. A Ty dasz radę? 🦭🏅');
  }
  $('diplomaGrid')?.addEventListener('click',e=>{
    const download=e.target.closest('[data-diploma-download]'),share=e.target.closest('[data-diploma-share]');
    if(download)downloadDiploma(download.dataset.diplomaDownload);
    if(share)shareDiploma(share.dataset.diplomaShare);
  });
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
    const done=saved.date===fortuneDate(),wheel=$('fortuneWheel'),hand=$('fortuneHand'),claim=$('fortuneClaimLink');
    if(claim)claim.hidden=!(done&&saved.prizeIndex===7);
    if(wheel&&done&&Number.isFinite(saved.rotation)){wheel.style.transition='none';wheel.style.transform='rotate('+saved.rotation+'deg)'}
    if(hand){hand.setAttribute('aria-disabled',String(done));hand.tabIndex=done?-1:0}
    $('fortuneResult').textContent=done?(saved.prize||'Dziś już zakręcono kołem!'):'Koło czeka na pierwszy obrót…';
    $('fortuneNote').textContent=done?'Dzisiejsza niespodzianka jest już Twoja.':'Chwyć żółtą łapkę Morsa, przeciągnij ją po okręgu i puść. Jedno losowanie dziennie.';
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
  function finishFortuneSpin(rotation,stage,hand){
    const normalized=((360-(rotation%360))%360+360)%360;
    const index=Math.min(fortunePrizes.length-1,Math.floor(normalized/45));
    const p=fortunePrizes[index],prize=p.icon+' '+p.name+' — '+p.desc;
    localStorage.setItem(FORTUNE_KEY,JSON.stringify({date:fortuneDate(),prize,prizeIndex:index,rotation}));
    $('fortuneResult').textContent=prize;fortuneFinishSound();stage?.classList.remove('spinning','dragging');
    if(hand){hand.classList.remove('dragging');hand.style.left='';hand.style.top='';hand.style.right='';hand.style.bottom='';hand.style.transform=''}
    const claim=$('fortuneClaimLink'),jackpot=$('candyJackpot');if(claim)claim.hidden=index!==7;
    if(index===7&&jackpot){jackpot.hidden=false;document.body.classList.add('jackpot-open');window.setTimeout(()=>{jackpot.hidden=true;document.body.classList.remove('jackpot-open')},7500)}
    $('fortuneNote').textContent='Wylosowano! Mors zatwierdza tę decyzję, Koza Krzycha nie zgłasza reklamacji.';
    unlockSticker('fortune-spin');
  }
  function setupFortuneDrag(){
    const hand=$('fortuneHand'),wheel=$('fortuneWheel'),stage=document.querySelector('.fortune-wheel-stage');
    if(!hand||!wheel||!stage)return;
    let dragging=false,lastAngle=0,rotation=0,lastTime=0,velocity=0,lastDelta=0,finishTimer=null,activePointer=null;
    const angleAt=e=>{const r=wheel.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI};
    const angleDelta=(next,prev)=>{let d=next-prev;while(d>180)d-=360;while(d<-180)d+=360;return d};
    const placeHand=e=>{const r=stage.getBoundingClientRect();hand.style.right='auto';hand.style.bottom='auto';hand.style.left=(e.clientX-r.left)+'px';hand.style.top=(e.clientY-r.top)+'px';hand.style.transform='translate(-50%,-50%) rotate('+(angleAt(e)+90)+'deg)'};
    const start=e=>{
      let saved={};try{saved=JSON.parse(localStorage.getItem(FORTUNE_KEY)||'{}')||{}}catch{}
      if(dragging||saved.date===fortuneDate()||stage.classList.contains('spinning'))return;
      if(e.button!==undefined&&e.button!==0)return;
      e.preventDefault();dragging=true;activePointer=e.pointerId;
      lastAngle=angleAt(e);lastTime=performance.now();velocity=0;lastDelta=0;
      rotation=Number(wheel.dataset.rotation||0);wheel.style.transition='none';stage.classList.add('dragging');hand.classList.add('dragging');
      $('fortuneResult').textContent='Mors nabiera rozpędu…';$('fortuneNote').textContent='Przeciągnij palcem lub myszką po obwodzie koła i puść. Możesz złapać za łapkę albo samo koło!';
      placeHand(e);
    };
    const move=e=>{
      if(!dragging||e.pointerId!==activePointer)return;e.preventDefault();
      const now=performance.now(),angle=angleAt(e),delta=angleDelta(angle,lastAngle),dt=Math.max(8,now-lastTime);
      rotation+=delta;lastDelta=delta;velocity=velocity*.55+(delta/dt)*.45;lastAngle=angle;lastTime=now;
      wheel.style.transform='rotate('+rotation+'deg)';wheel.dataset.rotation=String(rotation);placeHand(e);
      if(soundOn&&Math.abs(delta)>2)sound(420,.018);
    };
    const end=e=>{
      if(!dragging||e.pointerId!==activePointer)return;e.preventDefault();dragging=false;activePointer=null;
      const direction=Math.sign(velocity||lastDelta||1),extraTurns=4+Math.min(2,Math.abs(velocity)*1.8);
      const target=rotation+direction*(360*extraTurns);
      stage.classList.remove('dragging');stage.classList.add('spinning');
      $('fortuneResult').textContent='Koło nabiera obrotów! Mors zaleca nie mrugać.';
      $('fortuneNote').textContent='Koza Krzycha pilnuje, żeby nikt nie próbował zatrzymać losu.';
      fortuneTickSequence();wheel.style.transition='transform 4.8s cubic-bezier(.12,.72,.12,1)';void wheel.offsetWidth;wheel.style.transform='rotate('+target+'deg)';
      wheel.dataset.rotation=String(target);
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;if(finishTimer)clearTimeout(finishTimer);finishFortuneSpin(target,stage,hand)};
      wheel.addEventListener('transitionend',ev=>{if(ev.propertyName==='transform')finish()},{once:true});
      finishTimer=window.setTimeout(finish,5100);
    };
    // Zdarzenia na całej tarczy, nie tylko na małym obrazku łapki.
    stage.addEventListener('pointerdown',start);
    // Ruch i puszczenie nasłuchujemy na oknie — kursor nie może „zgubić” koła,
    // gdy wyjedzie poza jego krawędź podczas przeciągania.
    window.addEventListener('pointermove',move,{passive:false});
    window.addEventListener('pointerup',end,{passive:false});
    window.addEventListener('pointercancel',end,{passive:false});
    hand.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!hand.hasAttribute('aria-disabled')){e.preventDefault();$('fortuneNote').textContent='Chwyć myszką lub palcem dowolne miejsce na kole, zakreśl pełny obrót i puść.'}});
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
  const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b%36]).join('');
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
  function startBackgroundMusic(){const player=$('backgroundMusic');if(!player||!musicOn||soccerMusicActive)return;if(!player.dataset.trimEndBound){player.loop=false;player.addEventListener('timeupdate',()=>{if(Number.isFinite(player.duration)&&player.duration>2&&player.currentTime>=player.duration-2&&!player.dataset.restarting){player.dataset.restarting='1';player.pause();player.currentTime=0;if(musicOn)player.play().catch(()=>{});window.setTimeout(()=>{delete player.dataset.restarting},120);}});player.addEventListener('ended',()=>{if(musicOn){player.currentTime=0;player.play().catch(()=>{});}});player.dataset.trimEndBound='1';}player.volume=.24;const attempt=player.play();if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{});}
  function setMusicEnabled(enabled){musicOn=!!enabled;localStorage.setItem('tkm_music',musicOn?'on':'off');const player=$('backgroundMusic'),cup=$('morsCupMusic');if(player){if(musicOn&&!soccerMusicActive)startBackgroundMusic();else player.pause();}if(cup){if(musicOn&&soccerMusicActive)cup.play().catch(()=>{});else cup.pause();}updateSoundButton();}
  function evaluate(board){for(const line of wins)if(board[line[0]]&&board[line[0]]===board[line[1]]&&board[line[1]]===board[line[2]])return{winner:board[line[0]],winning:line};return board.every(Boolean)?{winner:'draw',winning:[]}:{winner:null,winning:[]}}
  function setScoreCharacter(card,character){
    if(!card)return;const name=characterNames[character]||'Gracz';const icon=characterIcons[character]||'🐯';
    card.dataset.character=character;
    card.querySelector('b').textContent=name.toUpperCase();
    const img=card.querySelector('img');if(img){img.style.display=CHARACTER_EMOJI[character]?'none':'';if(!CHARACTER_EMOJI[character]){img.src=characterAssetUrl(character)+'?v=20261110-mascots-1';img.alt=name;}}
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
    const arrived=!!found&&!remoteCharacter;
    remoteCharacter=found;
    updateOnlineCharacters();render();
  }
  function showAttractionsHome(){
    document.body.classList.remove('view-tictactoe','view-soccer','view-fortune','view-mors-zone','soccer-fullscreen-open');
    const cup=$('morsCupMusic'),background=$('backgroundMusic');
    if(cup){cup.pause();cup.currentTime=0;}
    if(typeof soccerMusicActive!=='undefined'&&soccerMusicActive){soccerMusicActive=false;if(musicOn&&background)startBackgroundMusic();}
    $('soccerPlay')?.classList.add('hidden');
    $('mors-zone-drawer')?.removeAttribute('open');
    document.querySelector('.mors-zone-drawer')?.removeAttribute('open');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function openAttraction(which){
    // Widoki atrakcji muszą działać także po wcześniejszym wejściu do gry,
    // gdy panel konfiguracji (#setup) mógł pozostać ukryty.
    setup?.classList.remove('hidden');
    game?.classList.add('hidden');
    document.body.classList.remove('view-tictactoe','view-soccer','view-fortune','view-mors-zone','soccer-fullscreen-open');
    document.body.classList.add('view-'+which);
    // Muzyka Mors Cup ma grać od wejścia do sekcji, nie dopiero po uruchomieniu meczu.
    const cupTrack=$('morsCupMusic'),mainTrack=$('backgroundMusic');
    if(which==='soccer'){
      soccerMusicActive=true;
      if(mainTrack)mainTrack.pause();
      if(cupTrack){cupTrack.volume=.55;cupTrack.loop=true;if(musicOn)cupTrack.play().catch(err=>console.warn('Nie udało się uruchomić muzyki Mors Cup:',err));}
    }else if(soccerMusicActive){
      soccerMusicActive=false;
      if(cupTrack){cupTrack.pause();cupTrack.currentTime=0;}
      if(musicOn&&mainTrack)startBackgroundMusic();
    }
    const drawer=document.querySelector('.mors-zone-drawer');
    if(drawer && (which==='soccer'||which==='fortune'||which==='mors-zone')) drawer.open=true;
    if(which==='mors-zone'){
      const zone=document.querySelector('.mors-zone-drawer');
      if(zone)zone.open=true;
    }
    window.scrollTo({top:0,behavior:'auto'});
    if(which==='soccer')document.querySelector('.soccer-game')?.scrollIntoView({behavior:'smooth',block:'start'});
    if(which==='fortune')$('fortuneHeading')?.scrollIntoView({behavior:'smooth',block:'start'});
    if(which==='mors-zone')$('hrabiaInstituteHeading')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('openTicTacToe')?.addEventListener('click',()=>openAttraction('tictactoe'));
  $('openSoccer')?.addEventListener('click',()=>openAttraction('soccer'));
  $('openFortune')?.addEventListener('click',()=>openAttraction('fortune'));
  $('openMorsZone')?.addEventListener('click',()=>openAttraction('mors-zone'));
  $('attractionsBack')?.addEventListener('click',showAttractionsHome);
  function showGame(){resultOverlayDismissed=false;setup.classList.remove('hidden');setup.classList.add('playing');game.classList.remove('hidden');$('roomCode').textContent=room||'LOKALNIE';$('playerName').textContent=nick();if(mode==='online'){updateOnlineCharacters()}else{const ownCard=document.querySelector('.tiger-score');setScoreCharacter(ownCard,selectedCharacter);setScoreCharacter(document.querySelector('.mors-score'),'mors');}renderAchievements();newPrintBrief();}
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
  const characterNames={tiger:'Hrabia Poprawek',mors:'Mors',goat:'Koza Krzycha',octopus:'Ośmiornica Drukarka',bobr:'Bóbr',llama:'Lama Drama'};
  function applyCanonicalCharacterAssets(){document.querySelectorAll('img[data-character]').forEach(img=>{const character=img.dataset.character;if(characterAssets[character]){img.src=characterAssetUrl(character)+'?v=20261110-mascots-1';img.alt=characterNames[character]||img.alt;}});}
  const characterIcons={tiger:'🐯',mors:'🦭',goat:'🐐',octopus:'🐙',bobr:'🦫',llama:'🦙'};
  const characterQuips={
    goat:{move:['Koza Krzycha melduje: kopyto postawione, proszę nie regulować odbiorników.','Mee-e-eega ruch! Nawet Hrabia musi poprawić koronę.','Krzychu, to było Twoje kopyto czy pieczątka?','Koza Krzycha skacze po planszy. Kontrola jakości uciekła.','Beee-zdyskusyjny ruch. Komisja kopyt zatwierdza.','Koza Krzycha mówi: ja tu tylko przyszłam skubać zwycięstwo.','Uwaga na rogi! Strategia weszła na pełnej.','Kopytko w pole, rozum na urlopie.'],win:['KOZA KRZYCHA WYGRYWA! Reszta może iść skubać trawę.','BEEE-zapelacyjna wygrana! Krzychu, odbierz puchar!','Koza Krzycha rozniosła planszę. Dosłownie prawie ją zjadła.','Kopyta górą! Hrabia składa oficjalny protest.']},
    octopus:{move:['Ośmiornica Drukarka ma osiem pomysłów naraz!','Macka w ruch! Kolejny kolor na planszy!','Osiem rąk, zero wymówek. Drukujemy zwycięstwo!'],win:['OSIEM MACEK I PEŁNA KONTROLA!','Drukarka wypluła zwycięstwo w najwyższej jakości!']},
    bobr:{move:['Bóbr melduje: tama zbudowana, pole zajęte!','Zęby naostrzone, strategia dopięta.','Bóbr nie gryzie się w język. Ani w planszę!'],win:['BÓBR WYGRYWA! Tama zwycięstwa stoi!','To nie przypadek — to bobrza robota!']},
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
  function scheduleMorsIdle(){if(morsIdleTimer){clearTimeout(morsIdleTimer);morsIdleTimer=null;}}
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
  function render(){if(!current)return;cells.forEach((cell,i)=>{cell.innerHTML='';cell.classList.toggle('winning',(current.winning||[]).includes(i));const mark=current.board[i];if(mark){const character=characterForMark(mark);if(CHARACTER_EMOJI[character]){const avatar=document.createElement('span');avatar.className='board-character';avatar.textContent=CHARACTER_EMOJI[character];cell.append(avatar)}else{const im=document.createElement('img');im.className='board-avatar board-avatar-'+character;im.src=characterAssetUrl(character)+'?v=20261110-mascots-1';im.alt=characterNames[character]||'Maskotka SZS';cell.append(im)}}const canPlay=mode==='local'||(mode==='cpu'&&current.turn===TIGER)||(mode==='online'&&current.turn===role&&(current.guestJoined||role===current.creatorRole));cell.disabled=!!mark||current.status!=='playing'||!canPlay||busy});
    const w=current.winner;game.classList.toggle('round-finished',current.status==='finished');game.classList.toggle('round-draw',w==='draw');game.classList.toggle('series-won',!!seriesWinner);$('turnBanner').textContent=seriesWinner?('🏆 '+sideLabel(seriesWinner).toUpperCase()+' ZDOBYWA PUCHAR!'):w==='draw'?'REMIS! NIKT NIE ODPUSZCZA 😎':w?(sideLabel(w).toUpperCase()+' WYGRYWA!'):(mode==='local'?'RUCH: '+sideLabel(current.turn):mode==='cpu'?(current.turn===TIGER?'TWOJA KOLEJ — RUSZAJ!':'MORS MYŚLI…'):current.turn===role&&(!current.guestJoined?role===current.creatorRole:true)?'TWOJA KOLEJ — RUSZAJ!':!current.guestJoined?'PIERWSZY RUCH ZROBIONY — DRUGI GRACZ MOŻE DOŁĄCZYĆ W DOWOLNEJ CHWILI':'RUCH PRZECIWNIKA…');
    $('seriesLabel').textContent=(mode==='online'?'WYNIK TEJ SESJI':'SERIA DO 3 ZWYCIĘSTW')+' · '+(scores.tiger+scores.mors)+' ROZEGRANYCH RUND';$('roleLabel').textContent=mode==='local'?'DWAJ GRACZE · JEDNO URZĄDZENIE':mode==='cpu'?'TY: '+sideLabel(TIGER)+' · MORS: '+({easy:'ŁATWY',normal:'ŚREDNI',hard:'TRUDNY'}[cpuDifficulty]||'ŚREDNI'):'Grasz jako '+sideLabel(role)+' ('+(role===TIGER?'kółko':'krzyżyk')+')';$('newRoundBtn').disabled=current.status!=='finished'||!!seriesWinner;$('newMatchBtn').textContent=seriesWinner?'NOWY TURNIEJ ↻':'ZERUJ TURNIEJ ↻';$('newMatchBtn').classList.toggle('hidden',mode==='online');$('tigerScore').textContent=scores.tiger;$('morsScore').textContent=scores.mors;const resultOverlay=$('roundResultOverlay');if(resultOverlay){const resultTitle=$('roundResultTitle'),resultText=$('roundResultText'),resultIcon=$('roundResultIcon');if(current.status==='finished'){if(current.winner==='draw'){if(resultTitle)resultTitle.textContent='REMIS!';if(resultText)resultText.textContent='Nikt nie odpuszcza. Plansza potrzebuje dogrywki, a Mors — kawy.';if(resultIcon)resultIcon.textContent='🤝';}else{if(resultTitle)resultTitle.textContent=sideLabel(current.winner).toUpperCase()+' WYGRYWA!';if(resultText)resultText.textContent=seriesWinner?'PUCHAR WĘDRUJE DO ZWYCIĘZCY!':mode==='local'?'Runda rozstrzygnięta. Druga strona już szykuje protest.':(mode==='cpu'&&current.winner===TIGER)||(mode==='online'&&current.winner===role)?'Piękna robota! Hrabia właśnie sprawdza regulamin.':'Tym razem przeciwnik był górą. Rewanż czeka!';if(resultIcon)resultIcon.textContent=seriesWinner?'🏆':'💥';}}resultOverlay.hidden=current.status!=='finished'||resultOverlayDismissed;}updateSoundButton();}
  function makeRoomToken(){try{const source=window.crypto;if(source?.getRandomValues){const bytes=new Uint8Array(32);source.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}if(source?.randomUUID)return source.randomUUID()+source.randomUUID()}catch(e){console.warn('Nie udało się wygenerować silnego tokenu:',e)}throw Error('Ta przeglądarka nie udostępnia bezpiecznego generatora tokenów. Zaktualizuj przeglądarkę i spróbuj ponownie.')}
  function roomPlayerToken(){
    if(!room)throw Error('Brak aktywnego pokoju.');
    const hostToken=localStorage.getItem('tkm_host_'+room);
    const guestToken=localStorage.getItem('tkm_guest_'+room);
    if(hostToken&&current&&role===current.creatorRole)return hostToken;
    if(guestToken)return guestToken;
    if(hostToken)return hostToken;
    throw Error('Brak tokenu tego gracza. Otwórz ponownie zaproszenie na tym urządzeniu.');
  }
  async function fetchGame(){
    const{data,error}=await client.rpc('szs_secure_get_room',{p_room_code:room,p_player_token:roomPlayerToken()});
    if(error||!data)throw Error(error?.message||'Nie znaleziono pokoju lub token gracza jest nieprawidłowy.');
    return Array.isArray(data)?data[0]:data;
  }
  function fromRow(row){if(Array.isArray(row))row=row[0];if(!row)throw Error('Serwer nie zwrócił stanu planszy.');let board=row.board;if(typeof board==='string'){try{board=JSON.parse(board)}catch{board=null}}if(!Array.isArray(board)||board.length!==9)throw Error('Nieprawidłowy stan planszy otrzymany z serwera.');return{board,turn:row.turn||TIGER,winner:row.winner||null,status:row.status||'playing',guestJoined:row.guest_joined===true||row.guest_joined==='true',creatorRole:row.creator_role||TIGER,winning:evaluate(board).winning}}
  async function subscribe(){
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
    if(channel){try{await client.removeChannel(channel)}catch(e){console.warn('Nie udało się zamknąć poprzedniego kanału:',e)}}
    channel=client.channel('game-'+room,{config:{presence:{key:String(role)}}});
    channel.on('presence',{event:'sync'},syncPresenceCharacters);
    const applyIncoming=row=>{
      const wasPlaying=current?.status==='playing';
      const incoming=fromRow(row);
      if(wasPlaying&&incoming.status==='finished')countOnlineWinnerOnce(incoming.winner,incoming.board);
      if(current?.status==='finished'&&incoming.status==='playing')roundId=makeRoundId();
      if(wasPlaying&&incoming.status==='finished'){
        commentary(incoming.winner==='draw'?'draw':incoming.winner==='tiger'?'tigerWin':'morsWin');
        recordFinishedGame(incoming.winner,incoming.board,mode,room);
        maybeSecretEvent(incoming.board,true);
      }else if(current&&incoming.board.join('')!==current.board.join('')){
        const lastMark=incoming.board.find((v,i)=>v!==current.board[i]);
        if(lastMark)commentary(lastMark,characterForMark(lastMark));
        maybeSecretEvent(incoming.board,false);
      }
      current=incoming;render();
    };
    const st=await new Promise(resolve=>{
      channel.subscribe(s=>{if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'||s==='TIMED_OUT')resolve(s)});
      setTimeout(()=>resolve('TIMED_OUT'),7000);
    });
    if(st==='SUBSCRIBED'){
      try{
        const presenceResult=await channel.track({role,character:selectedCharacter,nick:nick(),joined_at:new Date().toISOString()});
        if(presenceResult==='error')console.warn('Nie udało się udostępnić maskotki w pokoju.');
      }catch(e){console.warn('Nie udało się udostępnić maskotki w pokoju:',e)}
    }else{
      console.warn('Realtime Presence niedostępny — synchronizuję planszę przez bezpieczny kanał RPC.');
    }
    current=fromRow(await fetchGame());
    // Stan planszy pobieramy przez RPC sprawdzające token gracza.
    pollTimer=setInterval(async()=>{
      if(!room||mode!=='online'||document.hidden)return;
      try{
        const row=await fetchGame();
        if(!current||JSON.stringify(row.board)!==JSON.stringify(current.board)||row.turn!==current.turn||row.status!==current.status||row.guest_joined!==current.guestJoined)applyIncoming(row);
      }catch(e){console.warn('Synchronizacja pokoju:',e)}
    },1300);
    if(st==='SUBSCRIBED'){syncPresenceCharacters();say('');}
    render();
  }
  async function createRoom(){
    if(!connect()||busy)return;
    roundId=makeRoundId();busy=true;$('createBtn').disabled=true;say('Tworzę pokój…');
    try{
      mode='online';remoteCharacter=null;room=roomCode();
      role=document.querySelector('input[name="mySide"]:checked')?.value||TIGER;
      const hostToken=makeRoomToken();
      localStorage.setItem('tkm_host_'+room,hostToken);
      const{data,error}=await client.rpc('szs_secure_create_room',{p_room_code:room,p_creator_role:role,p_host_token:hostToken});
      if(error)throw error;
      current=fromRow(data);scores={tiger:0,mors:0};seriesWinner=null;
      showGame();await subscribe();history.replaceState({},'',location.pathname+'?room='+room);
    }catch(e){
      if(room)localStorage.removeItem('tkm_host_'+room);
      const m=[e?.message,e?.details,e?.hint].filter(Boolean).join(' · ');
      if(e?.code==='PGRST202'||/szs_secure_create_room|schema cache|Could not find the function/i.test(m))say('Brakuje bezpiecznej funkcji pokoju w Supabase. Odśwież aplikację za chwilę i spróbuj ponownie.');
      else say('Nie udało się utworzyć pokoju: '+(m||'nieznany błąd połączenia.'));
    }finally{busy=false;$('createBtn').disabled=false;if(current&&mode==='online')render()}
  }
  async function joinRoom(code){
    if(!connect()||busy)return;
    roundId=makeRoundId();code=(code||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6,12}$/.test(code)){say('Wpisz prawidłowy kod z zaproszenia.');return}
    busy=true;$('joinBtn').disabled=true;say('Szukam pokoju…');
    try{
      mode='online';remoteCharacter=null;room=code;
      const savedHostToken=localStorage.getItem('tkm_host_'+room);
      if(savedHostToken){
        const{data,error}=await client.rpc('szs_secure_get_room',{p_room_code:room,p_player_token:savedHostToken});
        if(error)throw error;
        const hostRow=Array.isArray(data)?data[0]:data;
        role=hostRow?.creator_role||TIGER;
        current=fromRow(hostRow);
      }else{
        let guestToken=localStorage.getItem('tkm_guest_'+room);
        if(!guestToken){guestToken=makeRoomToken();localStorage.setItem('tkm_guest_'+room,guestToken)}
        const{data,error}=await client.rpc('szs_secure_join_room',{p_room_code:room,p_guest_token:guestToken});
        if(error)throw error;
        const joinedRow=Array.isArray(data)?data[0]:data;
        const creatorRole=joinedRow?.creator_role||TIGER;
        role=creatorRole===TIGER?MORS:TIGER;
        current=fromRow(joinedRow);
      }
      scores={tiger:0,mors:0};seriesWinner=null;showGame();await subscribe();
      history.replaceState({},'',location.pathname+'?room='+room);
    }catch(e){
      const m=[e?.message,e?.details,e?.hint].filter(Boolean).join(' · ')||'Nie udało się dołączyć.';
      say(/Pokój nie istnieje|token gracza jest nieprawidłowy|token tego gracza/i.test(m)?'Ten pokój nie istnieje, jest zajęty albo to urządzenie nie ma właściwego zaproszenia. Poproś o nowy link.':m);
      room=null;role=null;current=null;game.classList.add('hidden');setup.classList.remove('playing');setup.classList.remove('hidden');
    }finally{busy=false;$('joinBtn').disabled=false;if(current&&mode==='online')render()}
  }
  function startLocal(which){roundId=makeRoundId();remoteCharacter=null;mode=which;cpuDifficulty=$('cpuDifficulty')?.value||cpuDifficulty;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty);room=null;role=which==='cpu'?TIGER:'both';scores={tiger:0,mors:0};seriesWinner=null;current=fresh();showGame();$('roomCode').textContent=which==='cpu'?'VS KOMPUTER':'LOKALNIE';commentary('tiger',selectedCharacter);history.replaceState({},'',location.pathname);render();if(which==='cpu')say('Powodzenia! Mors nie będzie łatwym przeciwnikiem.')}
  function minimax(board,player){const r=evaluate(board);if(r.winner===MORS)return{score:10};if(r.winner===TIGER)return{score:-10};if(r.winner==='draw')return{score:0};let best={score:player===MORS?-Infinity:Infinity,index:-1};for(let i=0;i<9;i++)if(!board[i]){board[i]=player;const score=minimax(board,player===MORS?TIGER:MORS).score;board[i]='';if((player===MORS&&score>best.score)||(player===TIGER&&score<best.score))best={score,index:i}}return best}
  async function move(i){
    if(!current||busy||current.status!=='playing'||current.board[i])return;
    if(mode==='online'&&(current.turn!==role||(!current.guestJoined&&role!==current.creatorRole)))return;
    if(mode==='cpu'&&current.turn!==TIGER)return;
    busy=true;
    const mark=mode==='local'?current.turn:role;
    let optimisticSnapshot=null;
    try{
      if(mode==='online'){
        // Pokaż awatar natychmiast, bez czekania na odpowiedź serwera.
        optimisticSnapshot={...current,board:[...current.board]};
        current.board[i]=role;
        const optimisticResult=evaluate(current.board);
        current.winner=optimisticResult.winner;
        current.winning=optimisticResult.winning;
        current.status=optimisticResult.winner?'finished':'playing';
        current.turn=optimisticResult.winner?current.turn:(role===TIGER?MORS:TIGER);
        render();
        const{data,error}=await client.rpc('szs_secure_make_move',{p_room_code:room,p_player_token:roomPlayerToken(),p_cell:i});
        if(error)throw error;
        current=fromRow(data);
        if(current.board[i]!==role)current=fromRow(await fetchGame());
        if(current.board[i]!==role)throw Error('Serwer nie potwierdził ruchu na wybranym polu.');
      }else{
        current.board[i]=mark;
        const result=evaluate(current.board);
        current.winner=result.winner;
        current.winning=result.winning;
        current.status=result.winner?'finished':'playing';
        current.turn=result.winner?current.turn:(current.turn===TIGER?MORS:TIGER);
      }
      say('');
      soundAnimal(mark);
      if(current.winner){
        recordFinishedGame(current.winner,current.board,mode,room);
        if(current.winner!=='draw'){
          if(mode==='online')countOnlineWinnerOnce(current.winner,current.board);
          else{scores[current.winner]++;if(scores[current.winner]>=3)seriesWinner=current.winner;}
        }
        commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin',current.winner==='draw'?null:characterForMark(current.winner));
        soundAnimal(current.winner,true);
        celebrate();
        maybeSecretEvent(current.board,true);
      }else{
        commentary(mark,characterForMark(mark));
        maybeSecretEvent(current.board,false);
      }
    }catch(error){
      console.warn('Błąd ruchu:',error);
      if(mode==='online'){
        try{current=fromRow(await fetchGame())}catch(refreshError){console.warn('Nie udało się odświeżyć planszy:',refreshError);if(optimisticSnapshot)current=optimisticSnapshot}
      }
      const message='Ruch nie został zapisany: '+(error?.message||'nieznany błąd połączenia.');
      say(message);
      const banner=$('turnBanner');
      if(banner)banner.textContent=message;
    }finally{
      busy=false;
      render();
      if(mode==='cpu'&&current.status==='playing'&&current.turn===MORS)setTimeout(cpuMove,450);
    }
  }
  function cpuMove(){if(!current||current.status!=='playing'||mode!=='cpu')return;const empty=current.board.map((v,i)=>v?null:i).filter(v=>v!==null);let choice;if(cpuDifficulty==='easy'){choice=empty[Math.floor(Math.random()*empty.length)]}else if(cpuDifficulty==='normal'&&Math.random()<.35){choice=empty[Math.floor(Math.random()*empty.length)]}else{choice=minimax([...current.board],MORS).index}if(choice>=0)moveCpu(choice)}
  function moveCpu(i){if(busy||current.board[i])return;busy=true;current.board[i]=MORS;const r=evaluate(current.board);current.winner=r.winner;current.winning=r.winning;current.status=r.winner?'finished':'playing';current.turn=r.winner?MORS:TIGER;soundAnimal(MORS);if(current.winner){recordFinishedGame(current.winner,current.board,mode,room);if(current.winner!=='draw'){scores[current.winner]++;if(scores[current.winner]>=3)seriesWinner=current.winner;}commentary(current.winner==='draw'?'draw':current.winner==='tiger'?'tigerWin':'morsWin');celebrate();maybeSecretEvent(current.board,true)}else{commentary(MORS,'mors');maybeSecretEvent(current.board,false)}busy=false;render()}
  function celebrate(){document.body.classList.remove('celebrate');void document.body.offsetWidth;document.body.classList.add('celebrate');setTimeout(()=>document.body.classList.remove('celebrate'),1200)}
  async function newRound(){if(!current||current.status!=='finished'||busy||seriesWinner)return;resultOverlayDismissed=false;busy=true;try{if(mode==='online'){const{data,error}=await client.rpc('szs_secure_restart_room',{p_room_code:room,p_player_token:roomPlayerToken()});if(error)throw error;if(!data)throw Error('Serwer nie zwrócił nowej planszy.');current=fromRow(data);roundId=makeRoundId()}else{roundId=makeRoundId();current=fresh()}commentary('tiger')}catch(error){console.warn('Nie udało się rozpocząć rewanżu:',error);const message='Nie udało się rozpocząć rewanżu. Sprawdź połączenie i spróbuj ponownie.';const banner=$('turnBanner');if(banner)banner.textContent=message;say(message)}finally{busy=false;render()}}
  $('introEnterBtn')?.addEventListener('click',()=>{$('introScreen').classList.add('intro-dismissed');});
  $('roundResultClose')?.addEventListener('click',()=>{resultOverlayDismissed=true;$('roundResultOverlay').hidden=true;});
  // Delikatny odgłos papierowego stempla dla kliknięć interfejsu; respektuje przełącznik dźwięku.
  document.addEventListener('click',event=>{const control=event.target.closest('button.btn, a.btn');if(!control||control.id==='soundBtn'||control.classList.contains('cell')||control.disabled)return;sound(260,.045);window.setTimeout(()=>sound(390,.035),38);});
  setupFortuneDrag();$('quizStartBtn')?.addEventListener('click',startPrintQuiz);$('quizNextBtn')?.addEventListener('click',nextPrintQuiz);$('quizAgainBtn')?.addEventListener('click',()=>{$('quizResult').classList.add('hidden');$('quizStart').classList.remove('hidden');$('quizTrackFill').style.width='0%';});
  function renderSelectedCharacterPreview(){
    const box=$('roomCharacterPreview');if(!box)return;
    const name=characterNames[selectedCharacter]||characterNames.tiger;
    const visual=CHARACTER_EMOJI[selectedCharacter]?document.createElement('span'):document.createElement('img');
    if(visual.tagName==='IMG'){visual.src=characterAssetUrl(selectedCharacter)+'?v=20261110-mascots-1';visual.alt=name;}
    else visual.textContent=CHARACTER_EMOJI[selectedCharacter];
    visual.className='room-character-visual';
    const copy=document.createElement('span');copy.className='room-character-name';copy.textContent='Do pokoju wchodzisz jako: '+name;
    box.replaceChildren(visual,copy);
  }
  document.querySelectorAll('input[name="character"]').forEach(r=>{r.checked=r.value===selectedCharacter;r.addEventListener('change',()=>{selectedCharacter=r.value;localStorage.setItem('tkm_character',selectedCharacter);document.querySelectorAll('.character-option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));renderSelectedCharacterPreview();});});
  document.querySelectorAll('input[name="mySide"]').forEach(r=>r.addEventListener('change',()=>{document.querySelectorAll('.side-option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));}));
  applyCanonicalCharacterAssets();
  renderSelectedCharacterPreview();
  $('joinBtn').addEventListener('click',()=>joinRoom($('roomInput').value));$('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom(e.target.value)});$('roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));cells.forEach(c=>c.addEventListener('click',()=>move(+c.dataset.cell)));$('newRoundBtn').addEventListener('click',newRound);$('newMatchBtn').addEventListener('click',()=>{if(mode==='online'){say('Nowy turniej rozpocznijcie po uzgodnieniu z przeciwnikiem.');return}scores={tiger:0,mors:0};seriesWinner=null;resultOverlayDismissed=false;roundId=makeRoundId();current=fresh();commentary('tiger');render();});
  $('shareInviteBtn')?.addEventListener('click',()=>shareOnFacebook('Rzucam Ci wyzwanie! Wybierz swoją maskotkę i spróbuj mnie pokonać w Kółko, Krzyżyk i Dwa Promile Absurdu. 🐯🦭'));
  $('copyLeadBtn')?.addEventListener('click',copyLeadMessage);
  $('morsMessengerBtn')?.addEventListener('click',e=>{e.preventDefault();contactMors()});
  $('shareResultBtn')?.addEventListener('click',()=>{const result=current?.winner?(current.winner==='draw'?'Remis!':sideLabel(current.winner)+' wygrywa!'):'Dołącz do pojedynku!';shareOnFacebook('Mój pojedynek w Kółko, Krzyżyk i Dwa Promile Absurdu: '+result+' Wynik serii: Hrabia Poprawek '+scores.tiger+' : '+scores.mors+' Mors. Dasz radę lepiej? 🏆')});
  $('shareQuizBtn')?.addEventListener('click',()=>shareOnFacebook('Mój wynik w teście Mistrza Drukarni: '+quizPoints+' / '+printQuiz.length+' punktów! Sprawdź, czy znasz się na poligrafii. 🖨️'));
  $('copyBtn').addEventListener('click',async()=>{const url=location.origin+location.pathname+'?room='+room;try{await navigator.clipboard.writeText(url);$('copyBtn').textContent='SKOPIOWANO ✓';setTimeout(()=>$('copyBtn').textContent='KOPIUJ LINK ↗',1800)}catch{prompt('Skopiuj link:',url)}});
  $('leaveBtn').addEventListener('click',()=>{if(pollTimer){clearInterval(pollTimer);pollTimer=null;}if(channel)client.removeChannel(channel);location.href=location.pathname});$('cpuBtn').addEventListener('click',()=>startLocal('cpu'));$('localBtn').addEventListener('click',()=>startLocal('local'));$('soundBtn').addEventListener('click',e=>{e.preventDefault();soundOn=!soundOn;localStorage.setItem('tkm_sound',soundOn?'on':'off');updateSoundButton();if(soundOn)soundAnimal(TIGER,true)});$('musicBtn')?.addEventListener('click',e=>{e.preventDefault();setMusicEnabled(!musicOn)});document.addEventListener('pointerdown',()=>{if(musicOn)startBackgroundMusic()},{once:true});$('introEnterBtn')?.addEventListener('click',()=>{if(musicOn)startBackgroundMusic()});updateSoundButton();$('refreshLeaderboardBtn')?.addEventListener('click',loadLeaderboard);$('newBriefBtn')?.addEventListener('click',newPrintBrief);
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

    // MORS CUP — papierowe piłkarzyki, lokalny pojedynek dwóch osób na jednym ekranie.
    const soccerPlay=$('soccerPlay'),soccerBoard=$('soccerBoard'),soccerTurn=$('soccerTurn'),soccerStatus=$('soccerStatus');
    let soccerVsMors=false,soccerAiTimer=null;
    const soccerRows=17,soccerCols=11,soccerX=c=>10+c*16,soccerY=r=>8+r*16;
    const soccerGoals={min:4,max:6};
    let soccer={lines:new Set(),visits:new Map(),position:{c:5,r:8},turn:0,started:false,over:false,score:[0,0],history:[]};
    const soccerNames=['MORS','HRABIA'];
    const soccerName=i=>i===0?'MORS':(soccerVsMors?'TY':'HRABIA');
    const soccerCommentEl=$('soccerComment');
    let soccerLastComment='';
    const soccerCommentLines={
      start:['Rozgrzewka zakończona. Płetwy gotowe, rozsądek zostawiony w szatni.','Proszę nie karmić piłki. Jest przed meczem.','Hrabia twierdzi, że ma taktykę. Mors widział tylko ketchup na planie.'],
      move:['To nie był przypadek. To była geometria stosowana po morsowemu.','Piłka idzie tam, gdzie prowadzi ją przeznaczenie. Albo krzywa kreska.','Publiczność wstrzymała oddech. Jedna mewa nawet usiadła.','Taktyka jest prosta: kreska, oddech, panika.'],
      bounce:['ODBICIE! Piłka wróciła. W przeciwieństwie do rozsądku.','Kreska odbita, honor uratowany. Na razie.','Mors nazywa to planem. Sędzia nazywa to bałaganem.'],
      band:['BANDA! Piłka dostała drugą szansę. Nie zmarnuj jej, płetwo!','O bandę! To był zaplanowany manewr. Tak, oczywiście.','Piłka odbita. Hrabia właśnie udaje, że tak miało być.'],
      goal:['GOOOL! Siatka drży, Mors świętuje, ryby składają gratulacje!','Trafienie idealne! Hrabia żąda analizy piksel po pikselu.','BRAMKA! Proszę odnotować, że piłka sama tam chciała.'],
      blocked:['KONIEC! Zablokowany jak drukarka w poniedziałek rano.','Nie ma wyjścia. Mors zamyka zeszyt i otwiera lodówkę.','Blokada totalna! VAR sprawdza, czy winna była kreska czy charakter.'],
      undo:['Cofamy! Mors twierdzi, że to była próba generalna.','Ruch skasowany. Świadkowie proszeni o milczenie.','Hrabia zgłosił sprzeciw wobec cofania rzeczywistości.'],
      reset:['Nowy mecz, czysta kartka i te same złe nawyki.','Zaczynamy od zera. Mors już podejrzewa spisek.','Piłka na środku. Ambicje ogromne, kondycja papierowa.']
    };
    function soccerSay(kind){
      const choices=soccerCommentLines[kind]||soccerCommentLines.move;
      let line=choices[Math.floor(Math.random()*choices.length)];
      if(choices.length>1)while(line===soccerLastComment)line=choices[Math.floor(Math.random()*choices.length)];
      soccerLastComment=line;
      if(soccerCommentEl)soccerCommentEl.textContent=(Math.random()<.5?'🦭 MORS: ':'🐯 HRABIA: ')+line;
    }
    const soccerKey=(a,b)=>{const p=[a.c+','+a.r,b.c+','+b.r].sort();return p.join('|')};
    const soccerNeighbors=(p)=>{const out=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(dc===0&&dr===0)continue;const c=p.c+dc,r=p.r+dr;if(c>=0&&c<soccerCols&&r>=0&&r<soccerRows)out.push({c,r})}return out};
    function soccerCanMove(to){return soccerNeighbors(soccer.position).some(p=>p.c===to.c&&p.r===to.r)&&!soccer.lines.has(soccerKey(soccer.position,to))}
    function soccerDraw(){
      if(!soccerBoard)return;
      const p=soccer.position,available=soccer.started&&!soccer.over&&(!soccerOnline||(soccerOnlineGuestJoined&&soccerOnlineRole===soccer.turn))&&!soccerOnlineBusy?soccerNeighbors(p).filter(n=>soccerCanMove(n)):[];
      const ink=['ink-cyan','ink-magenta','ink-yellow','ink-black'];
      const lineMarkup=[...soccer.lines].map((key,i)=>{const [a,b]=key.split('|'),[ac,ar]=a.split(',').map(Number),[bc,br]=b.split(',').map(Number);const x1=soccerX(ac),y1=soccerY(ar),x2=soccerX(bc),y2=soccerY(br),dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;const wobble=(((ac*17+ar*11+bc*7+br*13)%7)-3)*1.15;const mx=(x1+x2)/2-(dy/len)*wobble,my=(y1+y2)/2+(dx/len)*wobble;const move=soccer.history.find(h=>h.line===key);const opponentMove=!!move&&(soccerVsMors?move.turn===0:soccerOnline?move.turn!==soccerOnlineRole:false);return '<path class="move-line '+(opponentMove?'ink-green':ink[i%ink.length])+'" d="M '+x1.toFixed(2)+' '+y1.toFixed(2)+' Q '+mx.toFixed(2)+' '+my.toFixed(2)+' '+x2.toFixed(2)+' '+y2.toFixed(2)+'"/>'}).join('');
      const dots=[];for(let r=0;r<soccerRows;r++)for(let c=0;c<soccerCols;c++){const active=available.some(n=>n.c===c&&n.r===r),current=p.c===c&&p.r===r;dots.push('<circle class="paper-dot'+(current?' current':'')+(active?' available':'')+'" cx="'+soccerX(c)+'" cy="'+soccerY(r)+'" r="'+(active?3.1:current?2.8:1.25)+'" '+(active?'data-soccer-point="'+c+','+r+'" tabindex="0" role="button" aria-label="Ruch do pola '+(c+1)+', '+(r+1)+'"':'')+'/>')};
      const gridLines=[];for(let c=0;c<soccerCols;c++){const x=soccerX(c);gridLines.push('M'+x+' 8V264')}for(let r=0;r<soccerRows;r++){const y=soccerY(r);gridLines.push('M10 '+y+'H170')}
      soccerBoard.innerHTML='<rect class="paper-sheet" x="0" y="0" width="180" height="280"/><path class="paper-grid" d="'+gridLines.join(' ')+'"/><rect class="goal-zone" x="74" y="0" width="32" height="8"/><rect class="goal-zone bottom" x="74" y="264" width="32" height="16"/><path class="field-line" d="M10 8H74 M106 8H170 M10 264H74 M106 264H170 M10 8V264H170V8 M10 136H170 M42 8V40H138V8 M42 264V232H138V264"/>'+lineMarkup+dots.join('')+'<circle class="ball" cx="'+soccerX(p.c)+'" cy="'+soccerY(p.r)+'" r="5.5"/>';
      $('soccerScoreOne').textContent=soccer.score[0];$('soccerScoreTwo').textContent=soccer.score[1];
      $('soccerPlayerOne').textContent=soccerNames[0];$('soccerPlayerTwo').textContent=soccerVsMors?'TY':'HRABIA';
      soccerTurn.textContent=soccer.over?'KONIEC MECZU':soccer.started?'RUCH: '+soccerName(soccer.turn):'GOTOWI? ZACZYNAMY!';
    }
    function soccerNewRound(keepScore=true){
      if(soccerOnline){soccerOnlineReset();return}
      const score=keepScore?soccer.score:[0,0];
      clearTimeout(soccerAiTimer);
      soccer={lines:new Set(),visits:new Map([['5,8',1]]),position:{c:5,r:8},turn:soccerVsMors?1:Math.random()<.5?0:1,started:true,over:false,score,history:[]};
      soccerStatus.textContent='Start! Kliknij jedną z niebieskich kropek obok piłki.';
      soccerSay(keepScore?'reset':'start');
      soccerDraw();
      if(soccerVsMors&&soccer.turn===0)soccerScheduleAi();
    }
    function soccerScheduleAi(){
      clearTimeout(soccerAiTimer);
      if(!soccerVsMors||!soccer.started||soccer.over||soccer.turn!==0)return;
      soccerStatus.textContent='Mors myśli… podobno ma plan. 🦭';
      soccerTurn.textContent='RUCH: MORS KOMBINUJE';
      soccerAiTimer=setTimeout(()=>{
        if(!soccerVsMors||soccer.over||soccer.turn!==0)return;
        const moves=soccerNeighbors(soccer.position).filter(soccerCanMove);
        if(!moves.length)return;
        const level=$('cpuDifficulty')?.value||'normal';
        const ranked=moves.map(m=>{
          const goal=m.r===0&&m.c>=soccerGoals.min&&m.c<=soccerGoals.max;
          const next=soccerNeighbors(m).filter(n=>!soccer.lines.has(soccerKey(m,n))&&!(n.c===soccer.position.c&&n.r===soccer.position.r)).length;
          const progress=(soccer.position.r-m.r);
          const center=3-Math.abs(3-m.c);
          return {m,score:(goal?10000:0)+progress*(level==='hard'?5:level==='normal'?3:1)+next*(level==='hard'?1.5:1)+center*.2+Math.random()*(level==='easy'?8:level==='normal'?3:.5)};
        }).sort((a,b)=>b.score-a.score);
        const chosen=level==='easy'&&Math.random()<.45?moves[Math.floor(Math.random()*moves.length)]:ranked[0].m;
        soccerMove(chosen);
      },level==='hard'?420:level==='normal'?650:850);
    }
    function soccerMove(to){
      if(soccerOnline){soccerOnlineMove(to);return}
      if(!soccer.started||soccer.over||!soccerCanMove(to))return;
      const from={...soccer.position},line=soccerKey(from,to),prior=soccer.visits.get(to.c+','+to.r)||0;
      soccer.history.push({from,to:{...to},turn:soccer.turn,line});
      soccer.lines.add(line);soccer.position={...to};
      const goal=(to.r===0||to.r===soccerRows-1)&&to.c>=soccerGoals.min&&to.c<=soccerGoals.max;
      if(goal){soccer.score[soccer.turn]++;soccer.over=true;soccerStatus.textContent='GOOOL! '+soccerName(soccer.turn)+' trafia do bramki! Mors żąda powtórki VAR z kałuży.';soccerSay('goal');soccerDraw();return}
      const edge=to.c===0||to.c===soccerCols-1||to.r===0||to.r===soccerRows-1;
      soccer.visits.set(to.c+','+to.r,prior+1);
      if(prior>0||edge){soccerStatus.textContent=prior>0?'ODBICIE OD WŁASNEJ KRESKI! Grasz ponownie.':'BANDA! Piłka odbita — ten sam gracz gra dalej.';soccerSay(prior>0?'bounce':'band')}
      else{soccer.turn=1-soccer.turn;soccerStatus.textContent='Ruch przeciwnika. Nie oddawaj pola!';soccerSay('move')}
      const possible=soccerNeighbors(soccer.position).some(n=>!soccer.lines.has(soccerKey(soccer.position,n)));
      if(!possible){soccer.over=true;soccer.score[1-soccer.turn]++;soccerStatus.textContent='ZABLOKOWANY! '+soccerName(1-soccer.turn)+' wygrywa. Mors zamyka zeszyt.';soccerSay('blocked')}
      soccerDraw();
      if(soccerVsMors&&soccer.turn===0)soccerScheduleAi();
    }
    function startSoccerMusic(){const cup=$('morsCupMusic'),background=$('backgroundMusic');soccerMusicActive=true;if(background)background.pause();if(cup){cup.volume=.55;cup.loop=true;if(musicOn)cup.play().catch(()=>{});}}
    function stopSoccerMusic(){const cup=$('morsCupMusic'),background=$('backgroundMusic');soccerMusicActive=false;if(cup){cup.pause();cup.currentTime=0;}if(musicOn&&background)startBackgroundMusic();}
    function exitSoccer(){if(soccerOnline)soccerLeaveOnline();document.body.classList.remove('soccer-fullscreen-open');stopSoccerMusic();soccerPlay.classList.add('hidden');$('soccerOnlineLobby')?.classList.add('hidden');$('soccerStart')?.classList.remove('hidden');$('soccerTrain')?.classList.remove('hidden');$('soccerTwoPlayers')?.classList.remove('hidden');$('soccerOnlineStart')?.classList.remove('hidden');showAttractionsHome();}
    function startSoccer(vsMors){
      document.body.classList.add('soccer-fullscreen-open');
      startSoccerMusic();
      soccerVsMors=!!vsMors;
      soccerPlay.classList.remove('hidden');
      $('soccerStart')?.classList.add('hidden');
      $('soccerTrain')?.classList.add('hidden');
      $('soccerTwoPlayers')?.classList.add('hidden');
      $('soccerPlayerTwo').textContent=soccerVsMors?'TY':'HRABIA';
      soccerNewRound(false);
    }

    // Pojedynek online Mors Cup — serwer jest jedynym źródłem prawdy o ruchach.
    let soccerOnline=false,soccerOnlineRole=null,soccerOnlineRoom=null,soccerOnlineToken=null,soccerOnlinePoll=null,soccerOnlineBusy=false,soccerOnlineGuestJoined=false;
    const soccerOnlineMessage=$('soccerOnlineMessage');
    const soccerOnlineNote=(message)=>{if(soccerOnlineMessage)soccerOnlineMessage.textContent=message};
    const soccerOnlineCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b%36]).join('');
    const soccerToken=()=>crypto.randomUUID?crypto.randomUUID():('szs-'+Date.now()+'-'+Math.random().toString(36).slice(2));
    function soccerApplyOnline(payload){
      const data=Array.isArray(payload)?payload[0]:payload;
      const state=data?.state||data;
      if(!state||!state.position)throw Error('Serwer zwrócił niepełny stan meczu.');
      soccer.lines=new Set(state.lines||[]);
      soccer.visits=new Map(Object.entries(state.visits||{}).map(([k,v])=>[k,Number(v)]));
      soccer.position={c:Number(state.position.c),r:Number(state.position.r)};
      soccer.turn=Number(state.turn)||0;soccer.started=state.started!==false;soccer.over=!!state.over;
      soccer.score=Array.isArray(state.score)?state.score.map(Number):[0,0];
      soccer.history=Array.isArray(state.history)?state.history:[];
      soccerOnlineGuestJoined=!!data.guest_joined;soccerOnlineNote(soccerOnlineGuestJoined?'Przeciwnik dołączył. Mecz trwa!':'Pokój gotowy — czekamy na drugiego gracza…');
      $('soccerPlayerOne').textContent='MORS / GRACZ 1';
      $('soccerPlayerTwo').textContent='HRABIA / GRACZ 2';
      $('soccerUndo').disabled=true;
      soccerDraw();
      if(!data.guest_joined&&!soccerOnlineRole)soccerTurn.textContent='OCZEKIWANIE NA PRZECIWNIKA…';
      else if(!data.guest_joined&&soccerOnlineRole===0)soccerTurn.textContent='POKÓJ OTWARTY — CZEKA NA GOŚCIA';
      else if(!soccer.over)soccerTurn.textContent=soccer.turn===soccerOnlineRole?'TWOJA KOLEJ!':'RUCH PRZECIWNIKA…';
      if(soccer.over)soccerTurn.textContent='KONIEC MECZU — '+(soccer.score[0]>soccer.score[1]?'WYGRYWA GRACZ 1':soccer.score[1]>soccer.score[0]?'WYGRYWA GRACZ 2':'REMIS');
    }
    async function soccerOnlineGet(){
      const {data,error}=await client.rpc('szs_soccer_get_room',{p_room_code:soccerOnlineRoom,p_player_token:soccerOnlineToken});
      if(error)throw error;soccerApplyOnline(data);
    }
    function soccerOnlineStartPolling(){
      if(soccerOnlinePoll)clearInterval(soccerOnlinePoll);
      soccerOnlinePoll=setInterval(async()=>{
        if(!soccerOnline||soccerOnlineBusy||document.hidden)return;
        try{await soccerOnlineGet()}catch(e){soccerOnlineNote('Problem z synchronizacją: '+(e.message||'sprawdź połączenie'))}
      },1300);
    }
    async function soccerOnlineCreate(){
      if(!connect())return;
      const button=$('soccerCreateRoom');button.disabled=true;soccerOnlineNote('Tworzę pokój…');
      try{
        soccerOnlineRoom=soccerOnlineCode();soccerOnlineToken=soccerToken();soccerOnlineRole=0;
        localStorage.setItem('szs_soccer_host_'+soccerOnlineRoom,soccerOnlineToken);
        const {data,error}=await client.rpc('szs_soccer_create_room',{p_room_code:soccerOnlineRoom,p_host_token:soccerOnlineToken});
        if(error)throw error;
        soccerOnline=true;soccerVsMors=false;soccerApplyOnline(data);
        $('soccerRoomCode').textContent=soccerOnlineRoom;$('soccerRoomCreated').classList.remove('hidden');
        soccerOnlineNote('Pokój utworzony. Wyślij kod lub link przeciwnikowi.');
        history.replaceState({},'',location.pathname+'?soccer='+soccerOnlineRoom);
        soccerShowOnlineGame();soccerOnlineStartPolling();
      }catch(e){soccerOnlineNote('Nie udało się utworzyć pokoju: '+(e.message||'błąd połączenia'))}
      finally{button.disabled=false}
    }
    async function soccerOnlineJoin(code){
      if(!connect())return;
      code=(code||'').trim().toUpperCase();
      if(!/^[A-Z0-9]{8}$/.test(code)){soccerOnlineNote('Wpisz prawidłowy 8-znakowy kod meczu.');return}
      const button=$('soccerJoinRoom');if(button)button.disabled=true;soccerOnlineNote('Dołączam do meczu…');
      try{
        soccerOnlineRoom=code;
        soccerOnlineToken=localStorage.getItem('szs_soccer_guest_'+code)||soccerToken();
        localStorage.setItem('szs_soccer_guest_'+code,soccerOnlineToken);
        soccerOnlineRole=1;
        const {data,error}=await client.rpc('szs_soccer_join_room',{p_room_code:code,p_guest_token:soccerOnlineToken});
        if(error)throw error;
        soccerOnline=true;soccerVsMors=false;soccerApplyOnline(data);
        history.replaceState({},'',location.pathname+'?soccer='+code);
        soccerShowOnlineGame();soccerOnlineStartPolling();
      }catch(e){soccerOnlineNote('Nie udało się dołączyć: '+(e.message||'sprawdź kod pokoju'))}
      finally{if(button)button.disabled=false}
    }
    function soccerShowOnlineGame(){
      document.body.classList.add('soccer-fullscreen-open');startSoccerMusic();
      soccerPlay.classList.remove('hidden');$('soccerOnlineLobby').classList.add('hidden');
      $('soccerStart')?.classList.add('hidden');$('soccerTrain')?.classList.add('hidden');$('soccerTwoPlayers')?.classList.add('hidden');$('soccerOnlineStart')?.classList.add('hidden');
      $('soccerExit').textContent='OPUŚĆ MECZ ↩';soccerDraw();
    }
    async function soccerOnlineMove(to){
      if(soccerOnlineBusy||soccer.over||soccerOnlineRole!==soccer.turn)return;
      soccerOnlineBusy=true;soccerOnlineNote('Zapisuję ruch…');
      try{
        const {data,error}=await client.rpc('szs_soccer_move',{p_room_code:soccerOnlineRoom,p_player_token:soccerOnlineToken,p_c:to.c,p_r:to.r});
        if(error)throw error;soccerApplyOnline(data);soccerOnlineNote('Ruch zapisany — plansza zsynchronizowana.');
      }catch(e){soccerOnlineNote('Ruch nie został zapisany: '+(e.message||'spróbuj ponownie'));try{await soccerOnlineGet()}catch{}}
      finally{soccerOnlineBusy=false;soccerDraw()}
    }
    async function soccerOnlineReset(){
      if(soccerOnlineBusy||!soccer.over)return;
      soccerOnlineBusy=true;soccerOnlineNote('Przygotowuję rewanż…');
      try{const {data,error}=await client.rpc('szs_soccer_reset_room',{p_room_code:soccerOnlineRoom,p_player_token:soccerOnlineToken});if(error)throw error;soccerApplyOnline(data)}
      catch(e){soccerOnlineNote('Nie udało się rozpocząć rewanżu: '+(e.message||''))}
      finally{soccerOnlineBusy=false}
    }
    function soccerLeaveOnline(){
      if(soccerOnlinePoll){clearInterval(soccerOnlinePoll);soccerOnlinePoll=null}
      soccerOnline=false;soccerOnlineRole=null;soccerOnlineRoom=null;soccerOnlineToken=null;soccerOnlineBusy=false;soccerOnlineGuestJoined=false;
      $('soccerUndo').disabled=false;$('soccerExit').textContent='WRÓĆ DO MENU ↩';
      $('soccerRoomCreated').classList.add('hidden');$('soccerOnlineStart')?.classList.remove('hidden');
      history.replaceState({},'',location.pathname);
    }
    $('soccerOnlineStart')?.addEventListener('click',()=>{
      $('soccerTrain')?.classList.add('hidden');$('soccerTwoPlayers')?.classList.add('hidden');$('soccerOnlineStart')?.classList.add('hidden');
      $('soccerOnlineLobby').classList.remove('hidden');soccerOnlineNote('Utwórz nowy pokój albo dołącz, wpisując kod od przeciwnika.');
    });
    $('soccerCreateRoom')?.addEventListener('click',soccerOnlineCreate);
    $('soccerJoinRoom')?.addEventListener('click',()=>soccerOnlineJoin($('soccerRoomInput').value));
    $('soccerRoomInput')?.addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
    $('soccerRoomInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')soccerOnlineJoin(e.target.value)});
    $('soccerCopyInvite')?.addEventListener('click',async()=>{
      const url=location.origin+location.pathname+'?soccer='+soccerOnlineRoom;
      try{await navigator.clipboard.writeText(url);soccerOnlineNote('Link skopiowany. Wyślij go przeciwnikowi!')}
      catch{prompt('Skopiuj link do meczu:',url)}
    });
    $('soccerLobbyBack')?.addEventListener('click',()=>{
      $('soccerOnlineLobby').classList.add('hidden');$('soccerTrain')?.classList.remove('hidden');$('soccerTwoPlayers')?.classList.remove('hidden');$('soccerOnlineStart')?.classList.remove('hidden');
    });
    const soccerInvite=new URLSearchParams(location.search).get('soccer');
    if(soccerInvite){$('soccerOnlineLobby').classList.remove('hidden');$('soccerTrain')?.classList.add('hidden');$('soccerTwoPlayers')?.classList.add('hidden');$('soccerOnlineStart')?.classList.add('hidden');$('soccerRoomInput').value=soccerInvite.toUpperCase();soccerOnlineJoin(soccerInvite)}

    $('soccerStart')?.addEventListener('click',()=>startSoccer(false));
    $('soccerTrain')?.addEventListener('click',()=>startSoccer(true));
    $('soccerTwoPlayers')?.addEventListener('click',()=>startSoccer(false));
    $('soccerReset')?.addEventListener('click',()=>soccerNewRound(true));
    $('soccerExit')?.addEventListener('click',exitSoccer);
    $('soccerUndo')?.addEventListener('click',()=>{if(soccerOnline)return;const last=soccer.history.pop();if(!last||soccer.over)return;soccer.lines.delete(last.line);soccer.position=last.from;soccer.turn=last.turn;const k=last.to.c+','+last.to.r,n=(soccer.visits.get(k)||1)-1;if(n<=0)soccer.visits.delete(k);else soccer.visits.set(k,n);soccerStatus.textContent='Cofnięto ostatnią kreskę. Mors udaje, że nic nie widział.';soccerSay('undo');soccerDraw();if(soccerVsMors&&soccer.turn===0)soccerScheduleAi()});
    soccerBoard?.addEventListener('click',e=>{const dot=e.target.closest('[data-soccer-point]');if(!dot)return;const [c,r]=dot.dataset.soccerPoint.split(',').map(Number);soccerMove({c,r})});
    soccerBoard?.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const dot=e.target.closest('[data-soccer-point]');if(!dot)return;e.preventDefault();const [c,r]=dot.dataset.soccerPoint.split(',').map(Number);soccerMove({c,r})});
    soccerDraw();
  }



  // MORS CUP — profil zawodnika i publiczna tabela ligi.
  function initMorsCupLeague(){
    const root=$('morsCupLeague');if(!root)return;
    const profileId=()=>playerId();
    const nickname=$('morsCupNickname'),mascot=$('morsCupMascot'),status=$('morsCupProfileStatus');
    nickname.value=nick();mascot.value=characterAssets[selectedCharacter]?selectedCharacter:'mors';
    const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function note(message,error=false){status.textContent=message;status.classList.toggle('is-error',error)}
    async function loadLeague(){
      if(!connect()){ $('morsCupSeasonName').textContent='Tryb offline';$('morsCupSeasonStatus').textContent='Liga wymaga połączenia z bazą.';return}
      $('morsCupRefresh').disabled=true;
      try{
        const [seasonRes,tableRes,tournamentRes]=await Promise.all([
          client.from('morscup_seasons').select('id,name,status,starts_at').eq('status','active').order('starts_at',{ascending:false}).limit(1),
          client.from('morscup_league_table').select('player_id,nickname,mascot,played,wins,draws,losses,points,goal_difference').order('points',{ascending:false}).order('goal_difference',{ascending:false}).order('wins',{ascending:false}).limit(100),
          client.from('morscup_tournaments').select('id,name,capacity,status,created_at').in('status',['registration','in_progress']).order('created_at',{ascending:false}).limit(20)
        ]);
        if(seasonRes.error)throw seasonRes.error;if(tableRes.error)throw tableRes.error;if(tournamentRes.error)throw tournamentRes.error;
        const season=seasonRes.data?.[0];
        $('morsCupSeasonName').textContent=season?.name||'Brak aktywnego sezonu';
        $('morsCupSeasonStatus').textContent=season?'Sezon trwa. Zbieramy zgłoszenia i wyniki.':'Mors musi najpierw ogłosić nowy sezon.';
        const body=$('morsCupStandings');body.innerHTML='';
        if(!tableRes.data?.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="7">Brak zawodników. Zapisz profil jako pierwszy!</td>';body.append(tr)}
        else tableRes.data.forEach((p,i)=>{const tr=document.createElement('tr');if(p.player_id===profileId())tr.classList.add('is-you');tr.innerHTML='<td>'+(i+1)+'</td><td><b>'+safe(p.nickname)+'</b><small>'+safe(({mors:'🦭 Mors',tiger:'🐯 Hrabia Poprawek',goat:'🐐 Koza Krzycha',bobr:'🦫 Bóbr',llama:'🦙 Lama Drama',octopus:'🐙 Ośmiornica'}[p.mascot]||'Zawodnik'))+'</small></td><td>'+Number(p.played||0)+'</td><td>'+Number(p.wins||0)+'</td><td>'+Number(p.draws||0)+'</td><td>'+Number(p.losses||0)+'</td><td><b>'+Number(p.points||0)+'</b></td>';body.append(tr)});
        const list=$('morsCupTournamentList');list.innerHTML='';
        if(!tournamentRes.data?.length){list.textContent='Na razie brak otwartych turniejów. Mors podobno szuka pucharu.'}
        else tournamentRes.data.forEach(t=>{const card=document.createElement('article');card.className='morscup-tournament-card';const title=document.createElement('b');title.textContent=t.name;const detail=document.createElement('small');detail.textContent='Miejsca: do '+t.capacity+' · '+(t.status==='registration'?'Zapisy otwarte':'Turniej w trakcie');card.append(title,detail);if(t.status==='registration'){const join=document.createElement('button');join.type='button';join.className='btn btn-yellow';join.textContent='ZGŁOŚ MNIE';join.addEventListener('click',async()=>{join.disabled=true;if(!localStorage.getItem(MORS_CUP_TOKEN_KEY)){note('Najpierw zapisz swój profil zawodnika.',true);join.disabled=false;return}const {data,error}=await client.rpc('szs_morscup_join_tournament',{p_tournament_id:t.id,p_player_id:profileId(),p_player_token:morsCupPlayerToken()});if(error){note(/duplicate|already/i.test(error.message||'')?'Już jesteś na liście tego turnieju.':('Nie udało się zapisać: '+error.message),true);join.disabled=false}else note(data?.already_joined?'Już jesteś na liście startowej tego turnieju.':'Zgłoszenie przyjęte. Mors dopisał Cię do listy startowej!')});card.append(join)}list.append(card)});
      }catch(e){$('morsCupSeasonName').textContent='Nie udało się pobrać ligi';$('morsCupSeasonStatus').textContent=e?.message||'Błąd połączenia.';note('Nie udało się odświeżyć danych ligi: '+(e?.message||'błąd'),true)}
      finally{$('morsCupRefresh').disabled=false}
    }
    async function saveProfile(){
      const name=nickname.value.trim().slice(0,18);if(!name){note('Wpisz pseudonim zawodnika.',true);return}
      if(!connect()){note('Brak połączenia z bazą ligi.',true);return}
      const button=$('morsCupSaveProfile');button.disabled=true;
      try{
        const {error}=await client.rpc('szs_morscup_save_profile',{p_player_id:profileId(),p_player_token:morsCupPlayerToken(),p_nickname:name,p_mascot:mascot.value});
        if(error)throw error;
        localStorage.setItem('tkm_nick',name);localStorage.setItem('tkm_character',mascot.value);
        note('Profil zapisany! Płetwy na murawę — witamy w Mors Cup.');
        await loadLeague();
      }catch(e){note('Nie udało się zapisać profilu: '+(e?.message||'błąd'),true)}
      finally{button.disabled=false}
    }
    $('morsCupSaveProfile').addEventListener('click',saveProfile);
    $('morsCupRefresh').addEventListener('click',loadLeague);
    loadLeague();
  }

  // Morsowy Instytut Badań nad Hrabią Poprawek.
  function initHrabiaInstitute(){
    const reports=[
      'Hrabia zaakceptował projekt. Po chwili poprosił o zmianę. Po zmianie zapytał, dlaczego zmieniliśmy. Mors zalecił terapię plikiem PDF.',
      'Hrabia chce, żeby logo było większe, ale nie zajmowało więcej miejsca. Instytut rozważa zgłoszenie tego zjawiska do fizyki kwantowej.',
      'Przysłano inspirację. Nie pasuje do projektu, branży ani planety. Hrabia lubi w niej „to coś”. Mors nadal szuka.',
      'Plik FINAL doczekał się wersji 2, 3, OSTATECZNEJ i OSTATECZNEJ_poprawionej. Hrabia pyta, czy mamy tę pierwszą.',
      'Hrabia poprosił o przesunięcie elementu o dwa piksele w lewo. Po wykonaniu polecił przesunąć go odrobinę w prawo. Mors wyszedł na spacer.',
      'Kolor jest prawie idealny, ale powinien być cieplejszy, chłodniejszy i bardziej zdecydowany. Instytut zamówił termometr do palety CMYK.',
      'Hrabia napisał: „Mam drobną uwagę”. Mors natychmiast wyłączył telefon, zamknął drzwi i udawał fokę.',
      'Po siedemnastej korekcie Hrabia stwierdził, że pierwsza wersja miała potencjał. Mors przyznał projektowi status zabytku.',
      'Hrabia chce nowocześnie, ale klasycznie; prosto, ale bogato; spokojnie, ale z energią. Mors zapytał, czy może po prostu narysować rybę.',
      'Dziś Hrabia przesłał poprawki w trzech plikach, z których każdy zawierał inne poprawki. Mors powołał komisję śledczą.'
    ];
    const corrections=[
      '„Proszę powiększyć, ale żeby było subtelniej i nie rzucało się w oczy”.',
      '„Kolor jest dobry, tylko proszę użyć innego dobrego koloru”.',
      '„Wróćmy do pierwszej wersji, ale zostawmy zmiany z ostatniej”.',
      '„Może bardziej premium, ale bez przesady z tym premium”.',
      '„Proszę przesunąć o dwa piksele. Nie wiem w którą stronę, ale będzie widać”.',
      '„Jest świetnie. Proszę tylko zrobić od nowa, żeby było tak samo, ale lepiej”.',
      '„Niech będzie minimalistycznie, ale proszę dodać jeszcze kilka rzeczy”.',
      '„Logo jest za duże. Teraz za małe. Poprzednie było chyba w sam raz”.',
      '„Proszę dać więcej oddechu, ale nie zostawiać tyle pustego miejsca”.',
      '„Chodzi mi o klimat. Taki konkretny, ale trudno go opisać”.',
      '„Zróbmy wersję odważną, tylko żeby nikogo nie zaskoczyła”.',
      '„To już ostatnia poprawka. Tym razem naprawdę, prawie na pewno”.'
    ];
    const levels=['Spokojny klient','Mam jedną uwagę','A może spróbujmy inaczej','Proszę o nową wersję','Wróćmy do początku','To nie jest ten odcień','Czy można jeszcze dziś?','Plik FINAL_FINAL','Mors zamawia urlop','ALARM: HRABIA ZOBACZYŁ PIXEL'];
    const comments=['Mors jeszcze wierzy w ludzi. To się zmieni.','Pojawiły się pierwsze objawy drżenia płetwy.','Hrabia otworzył plik. Instytut wstrzymał oddech.','Korekta zaczyna mieć własną korektę.','Mors rozważa przejście na rybołówstwo.','Wersja projektu numeruje się już sama.','Zespół komunikuje się wyłącznie westchnieniami.','W drukarni zgasło światło. To tylko Hrabia szukał suwaka jasności.','Mors założył kask ochronny.','Instytut ogłasza stan pełnej katastrofy typograficznej.'];
    let count=Number(localStorage.getItem('szs_hrabia_actions')||0);
    let level=Number(localStorage.getItem('szs_hrabia_level')||3);
    const report=$('hrabiaReportText'),correction=$('hrabiaCorrectionText'),fill=$('hrabiaLevelFill'),label=$('hrabiaLevelLabel'),comment=$('hrabiaLevelComment'),progress=$('hrabiaBadgeProgress'),badges=$('hrabiaBadgeList');
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    function update(){
      if(fill)fill.style.width=(level*10)+'%';
      if(label)label.textContent=level+'/10 · „'+levels[level-1]+'”';
      if(comment)comment.textContent=comments[level-1];
      const unlocked=[count>=1,count>=5,count>=12];
      if(progress)progress.textContent='Wygenerowane materiały: '+count+' · Zdobyte odznaki: '+unlocked.filter(Boolean).length+'/3';
      if(badges)badges.innerHTML=['🗂️ Stażysta od poprawek','🧯 Strażak plików FINAL','🧘 Mistrz zen po 17 rundach'].map((x,i)=>'<span class="'+(unlocked[i]?'earned':'locked')+'">'+(unlocked[i]?'🏅 ':'🔒 ')+x+'</span>').join('');
    }
    function action(){count++;localStorage.setItem('szs_hrabia_actions',String(count));update()}
    $('hrabiaReportBtn')?.addEventListener('click',()=>{if(report)report.textContent=pick(reports);action()});
    $('hrabiaCorrectionBtn')?.addEventListener('click',()=>{if(correction)correction.textContent=pick(corrections);action()});
    $('hrabiaLevelBtn')?.addEventListener('click',()=>{level=Math.min(10,level+1);localStorage.setItem('szs_hrabia_level',String(level));if(level===10&&comment)comment.textContent='Mors opuścił instytut. Zostawił tylko karteczkę: „Nie dzwońcie”.';update();action()});
    update();
  }

  initMorsCupLeague();
  initHrabiaInstitute();
  initMiniArcade();
  renderDailyMissions();renderMorsJournal();renderStickers();renderDiplomas();renderMorsClub();renderFortune();loadLeaderboard();
  $('saveNameBtn').addEventListener('click',()=>{const n=$('nameInput').value.trim().slice(0,18);if(!n){say('Wpisz swój nick.');return}localStorage.setItem('tkm_nick',n);$('playerName').textContent=n;say('Nick zapisany na tym urządzeniu!')});$('nameInput').value=nick();
  if($('cpuDifficulty'))$('cpuDifficulty').value=cpuDifficulty;
  $('cpuDifficulty')?.addEventListener('change',e=>{cpuDifficulty=e.target.value;localStorage.setItem('tkm_cpu_difficulty',cpuDifficulty)});
  const q=new URLSearchParams(location.search).get('room');if(q){document.body.classList.add('view-tictactoe');$('roomInput').value=q.toUpperCase();if(configured())joinRoom(q)}if(!configured())say('Tryb online wymaga konfiguracji Supabase. Możesz jednak grać lokalnie lub z komputerem.');
})();
