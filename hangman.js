(() => {
  const $ = id => document.getElementById(id);
  const words = [
    ['Drukarnia','LAMINATOR'],['Drukarnia','KALIBRACJA'],['Drukarnia','PAPIER'],['Drukarnia','NAKLEJKA'],['Drukarnia','PROJEKT'],['Drukarnia','KOLOR'],['Drukarnia','BIGOWANIE'],['Drukarnia','GILOTYNA'],
    ['Klienci i poprawki','OSTATECZNA WERSJA'],['Klienci i poprawki','MAŁA POPRAWKA'],['Klienci i poprawki','NA WCZORAJ'],['Klienci i poprawki','BRIEF'],['Klienci i poprawki','AKCEPTACJA'],
    ['Świat Morścisława','MORŚCISŁAW'],['Świat Morścisława','PŁETWA'],['Świat Morścisława','RYBA'],['Świat Morścisława','LODÓWKA'],['Świat Morścisława','ABSURD'],
    ['Dwór Hrabiego','HRABIA POPRAWEK'],['Dwór Hrabiego','KOREKTA'],['Dwór Hrabiego','PERUKA'],['Dwór Hrabiego','ROZPORZĄDZENIE'],
    ['Koza Jołanna','KOZIA MĄDROŚĆ'],['Koza Jołanna','LAWENDA'],['Koza Jołanna','PRZEPOWIEDNIA']
  ];
  const letters='AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ'.split('');
  const chaos=['🗃️','📋','🐐','👑','🖨️','💥','🦭'];
  const remarks={
    start:'Spokojnie. To tylko siedem pomyłek dzieli nas od kompletnego bałaganu. W urzędzie nazywamy to poniedziałkiem.',
    good:['Trafiona litera! Morścisław odnotował sukces. W dwóch egzemplarzach, bo jeden może zginąć.','Dobrze! Urząd odzyskał wiarę w alfabety. Na krótko, ale jednak.','Jest! Nawet Hrabia Poprawek nie znalazł tu nic do poprawienia. Jeszcze.'],
    bad:['Pudło. Hrabia już nanosi poprawkę na Twoją intuicję.','Nietrafiona litera. Koza Jołanna twierdzi, że to wina faz księżyca.','Ojej. Drukarka właśnie wypluła formularz reklamacyjny.'],
    win:['HASŁO ODGADNIĘTE! Morścisław bije płetwami brawo. Jedna z nich jest od tego czerwona.','SUKCES! Urząd ocalał, a Hrabia nie zdążył zatwierdzić formularza katastrofy.'],
    lose:['URZĄD ULEGŁ AWARII. Morścisław ogłasza przerwę na rybę i odbudowę morale.','Koniec rundy. Hrabia Poprawek przejął urząd. Pierwsze zarządzenie: poprawić wszystko.']
  };
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  let answer='',category='',used=new Set(),mistakes=0,finished=false,solved=0;
  try{solved=Number(localStorage.getItem('szs_hangman_solved')||0)}catch{}
  const pick=(arr)=>arr[Math.floor(Math.random()*arr.length)];
  function setComment(text){$('hangmanComment').textContent=text}
  function render(){
    $('hangmanCategory').textContent='KATEGORIA: '+category.toUpperCase();
    $('hangmanMistakes').textContent='AWARIE: '+mistakes+' / 7';
    $('hangmanWord').innerHTML=[...answer].map(ch=>'<span class="hangman-letter">'+(ch===' '?' ':(used.has(ch)?ch:' '))+'</span>').join('');
    $('hangmanUsed').textContent='UŻYTE LITERY: '+([...used].sort().join(' · ')||'—');
    $('hangmanChaos').querySelectorAll('.chaos-item').forEach((el,i)=>el.classList.toggle('active',i<mistakes));
    $('hangmanKeyboard').querySelectorAll('button').forEach(btn=>{btn.disabled=finished||used.has(btn.dataset.letter)});
    $('hangmanRecord').textContent='TWÓJ REJESTR: '+solved+' ROZWIĄZANYCH HASEŁ';
  }
  function newRound(daily=false){
    let item;
    if(daily){
      const seed=Number(today().replaceAll('-',''));
      item=words[(seed*17+Math.floor(seed/7))%words.length];
    }else item=pick(words);
    [category,answer]=item;used=new Set();mistakes=0;finished=false;
    $('hangmanFeedback').textContent='Wybierz literę. Urząd wierzy w Ciebie bardziej niż w swój system archiwizacji.';
    $('hangmanKeyboard').innerHTML=letters.map(l=>'<button type="button" data-letter="'+l+'" aria-label="Litera '+l+'">'+l+'</button>').join('');
    $('hangmanKeyboard').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>guess(btn.dataset.letter)));
    setComment(remarks.start);render();
  }
  function guess(letter){
    if(finished||used.has(letter))return;
    used.add(letter);
    if(!answer.includes(letter)){
      mistakes++;$('hangmanFeedback').textContent=pick(remarks.bad);
      if(mistakes>=7){finished=true;$('hangmanFeedback').textContent=pick(remarks.lose)+' Hasło: '+answer+'.';setComment('Mówiłem, żeby nie dotykać formularza. Teraz mamy formularz do formularza.');}
    }else{
      $('hangmanFeedback').textContent=pick(remarks.good);
      if([...answer].every(ch=>ch===' '||used.has(ch))){
        finished=true;solved++;try{localStorage.setItem('szs_hangman_solved',String(solved))}catch{}
        $('hangmanFeedback').textContent=pick(remarks.win);
        setComment('Wiedziałem, że dasz radę. W końcu ktoś tu czyta instrukcje. Ja ich nie czytam, ale mam pieczątkę.');
      }
    }
    render();
  }
  $('hangmanNew')?.addEventListener('click',()=>newRound(false));
  $('hangmanShare')?.addEventListener('click',async()=>{
    const won=finished&&[...answer].every(ch=>ch===' '||used.has(ch));
    const text='URZĄD OSTATECZNEJ LITERY · '+(won?'HASŁO ODGADNIĘTE!':'MOJA RUNDA')+'\nAwarie: '+mistakes+'/7 · Rozwiązane hasła: '+solved+'\nWszystko jest pod kontrolą. Oprócz tego, co nie jest.\nZagraj w Kółko, Krzyżyk i Dwa Promile Absurdu: https://studiozimnegoskladu-max.github.io/tygrys-kontra-mors/';
    try{if(navigator.share)await navigator.share({title:'Urząd Ostatecznej Litery',text});else{await navigator.clipboard.writeText(text);$('hangmanFeedback').textContent='Wynik skopiowany. Roznoś absurd po świecie!';}}catch(e){if(e.name!=='AbortError')$('hangmanFeedback').textContent='Nie udało się udostępnić wyniku. Urząd przyjmuje skargi w środy.';}
  });
  document.addEventListener('keydown',e=>{if(!document.getElementById('hangmanPanel')?.getClientRects().length)return;const key=e.key.toLocaleUpperCase('pl-PL');if(letters.includes(key))guess(key)});
  newRound(true);
})();