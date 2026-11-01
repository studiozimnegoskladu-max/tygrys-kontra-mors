(() => {
  const $ = (id) => document.getElementById(id);
  const setup = $("setup"), game = $("game"), msg = $("setupMessage");
  const cells = [...document.querySelectorAll(".cell")];
  const TIGER = "tiger", MORS = "mors";
  let client, room = null, role = null, channel = null, current = null;
  let scores = { tiger: 0, mors: 0 }, busy = false;

  const freshState = () => ({ board: Array(9).fill(""), turn: TIGER, winner: null, status: "playing" });
  const roomCode = () => Math.random().toString(36).slice(2,8).toUpperCase();
  const say = (s) => { msg.textContent = s || ""; };
  const isConfigured = () => window.SUPABASE_URL && window.SUPABASE_ANON_KEY;
  function connect() {
    if (!isConfigured()) { say("Najpierw skonfiguruj Supabase — instrukcja jest w pliku README-PL.txt."); return false; }
    if (!client) client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return true;
  }
  function showGame() { setup.classList.add("hidden"); game.classList.remove("hidden"); $("roomCode").textContent = room; }
  function render() {
    if (!current) return;
    cells.forEach((cell, i) => {
      cell.innerHTML = "";
      cell.classList.toggle("winning", (current.winning || []).includes(i));
      const mark = current.board[i];
      if (mark) {
        const img = document.createElement("img");
        img.src = mark === TIGER ? "assets/tygrys-glowa.png" : "assets/mors.png";
        img.alt = mark === TIGER ? "Tygrys — kółko" : "Mors — krzyżyk";
        cell.appendChild(img);
      }
      cell.disabled = !!mark || current.status !== "playing" || current.turn !== role || busy;
    });
    const won = current.winner;
    if (won === "draw") $("turnBanner").textContent = "REMIS! NIKT NIE ODPUSZCZA 😎";
    else if (won) $("turnBanner").textContent = won === TIGER ? "TYGRYS WYGRYWA! 🐯" : "MORS ZGARNIA ZWYCIĘSTWO! 🦭";
    else $("turnBanner").textContent = current.turn === role ? "TWOJA KOLEJ — RUSZAJ!" : "RUCH PRZECIWNIKA…";
    $("roleLabel").textContent = role === TIGER ? "Grasz jako TYGRYS (kółko)" : "Grasz jako MORS (krzyżyk)";
    $("newRoundBtn").disabled = current.status !== "finished";
    $("tigerScore").textContent = scores.tiger;
    $("morsScore").textContent = scores.mors;
  }
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function evaluate(board) {
    for (const line of wins) if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) return { winner: board[line[0]], winning: line };
    return board.every(Boolean) ? { winner: "draw", winning: [] } : { winner: null, winning: [] };
  }
  async function fetchGame() {
    const { data, error } = await client.from("game_sessions").select("*").eq("room_code", room).maybeSingle();
    if (error || !data) throw new Error("Nie znaleziono pokoju. Sprawdź kod lub utwórz nowy.");
    return data;
  }
  function stateFromRow(row) {
    return { board: row.board || Array(9).fill(""), turn: row.turn || TIGER, winner: row.winner || null, status: row.status || "playing", winning: evaluate(row.board || Array(9).fill("")).winning };
  }
  async function subscribeRoom() {
    channel = client.channel("game-" + room);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: "room_code=eq." + room }, payload => {
      if (payload.new) { current = stateFromRow(payload.new); render(); }
    });
    const status = await new Promise((resolve) => {
      channel.subscribe(s => { if (s === "SUBSCRIBED") resolve(s); if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") resolve(s); });
      setTimeout(() => resolve("TIMED_OUT"), 12000);
    });
    if (status !== "SUBSCRIBED") throw new Error("Nie udało się połączyć na żywo. Odśwież stronę.");
    const row = await fetchGame(); current = stateFromRow(row); render();
  }
  async function createRoom() {
    if (!connect() || busy) return;
    busy = true; $("createBtn").disabled = true; say("Tworzę pokój…");
    try {
      room = roomCode(); role = TIGER;
      const { error } = await client.from("game_sessions").insert({ room_code: room, board: freshState().board, turn: TIGER, winner: null, status: "playing", guest_joined: false });
      if (error) throw error;
      current = freshState(); showGame(); await subscribeRoom();
      history.replaceState({}, "", location.pathname + "?room=" + room);
      $("roleLabel").textContent = "Grasz jako TYGRYS (kółko)";
    } catch(e) { say(e.message || "Coś poszło nie tak."); }
    finally { busy = false; $("createBtn").disabled = false; }
  }
  async function joinRoom(code) {
    if (!connect() || busy) return;
    code = (code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { say("Wpisz prawidłowy, 6-znakowy kod pokoju."); return; }
    busy = true; $("joinBtn").disabled = true; say("Szukam pokoju…");
    try {
      room = code;
      const row = await fetchGame();
      if (row.guest_joined) throw new Error("W tym pokoju jest już drugi gracz. Poproś o nowy pokój.");
      const { data, error } = await client.from("game_sessions").update({ guest_joined: true }).eq("room_code", room).eq("guest_joined", false).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Ktoś właśnie dołączył do tego pokoju. Poproś o nowy kod.");
      role = MORS; current = stateFromRow(data); showGame(); await subscribeRoom();
      history.replaceState({}, "", location.pathname + "?room=" + room);
    } catch(e) { say(e.message || "Nie udało się dołączyć."); room = null; role = null; }
    finally { busy = false; $("joinBtn").disabled = false; }
  }
  async function move(i) {
    if (!current || busy || current.status !== "playing" || current.turn !== role || current.board[i]) return;
    busy = true; current.board[i] = role;
    const result = evaluate(current.board);
    current.winner = result.winner; current.winning = result.winning;
    current.status = result.winner ? "finished" : "playing";
    current.turn = result.winner ? role : (role === TIGER ? MORS : TIGER);
    render();
    const { error } = await client.from("game_sessions").update({ board: current.board, turn: current.turn, winner: current.winner, status: current.status }).eq("room_code", room);
    if (error) { alert("Nie udało się zapisać ruchu. Sprawdź połączenie."); }
    if (current.winner && current.winner !== "draw") { scores[current.winner]++; render(); }
    busy = false; render();
  }
  async function newRound() {
    if (!current || current.status !== "finished" || busy) return;
    busy = true; $("newRoundBtn").disabled = true;
    const next = freshState();
    const { error } = await client.from("game_sessions").update({ board: next.board, turn: TIGER, winner: null, status: "playing" }).eq("room_code", room);
    if (error) alert("Nie udało się rozpocząć rewanżu.");
    current = next; render(); busy = false;
  }
  $("createBtn").addEventListener("click", createRoom);
  $("joinBtn").addEventListener("click", () => joinRoom($("roomInput").value));
  $("roomInput").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom($("roomInput").value); });
  $("roomInput").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  cells.forEach(c => c.addEventListener("click", () => move(Number(c.dataset.cell))));
  $("newRoundBtn").addEventListener("click", newRound);
  $("copyBtn").addEventListener("click", async () => {
    const url = location.origin + location.pathname + "?room=" + room;
    try { await navigator.clipboard.writeText(url); $("copyBtn").textContent = "SKOPIOWANO ✓"; setTimeout(() => $("copyBtn").textContent = "KOPIUJ LINK ↗", 1800); }
    catch { prompt("Skopiuj link do pokoju:", url); }
  });
  $("leaveBtn").addEventListener("click", () => { if (channel) client.removeChannel(channel); location.href = location.pathname; });
  const queryRoom = new URLSearchParams(location.search).get("room");
  if (queryRoom) { $("roomInput").value = queryRoom.toUpperCase(); if (isConfigured()) joinRoom(queryRoom); }
  if (!isConfigured()) say("Gra ma już przygotowaną oprawę. Aby uruchomić tryb online, wykonaj konfigurację z README-PL.txt.");
})();