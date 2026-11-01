TYGRYS KONTRA MORS — STUDIO ZIMNEGO SKŁADU
==========================================

Co jest w paczce?
- index.html, style.css, app.js — gra
- assets/ — przygotowane grafiki tygrysa i morsa
- supabase-setup.sql — konfiguracja bazy online
- config.js — miejsce na dane połączenia

WAŻNE
Gra jest przygotowana do rozgrywki online na dwóch osobnych urządzeniach.
Do uruchomienia potrzebuje darmowego projektu Supabase i hostingu strony.
W tej paczce nie ma jeszcze Twoich kluczy Supabase ani publicznego adresu gry.

KROK 1 — ZAŁÓŻ BAZĘ SUPABASE
1. Wejdź na https://supabase.com/ i załóż konto.
2. Utwórz nowy projekt (np. "tygrys-kontra-mors").
3. Otwórz w projekcie SQL Editor -> New query.
4. Otwórz plik supabase-setup.sql, skopiuj całą zawartość i uruchom (Run).
5. W projekcie wejdź w Project Settings -> API.
6. Skopiuj Project URL oraz anon/public key.

KROK 2 — WKLEJ DANE
1. Otwórz plik config.js.
2. Wstaw dane w dwa puste pola, np.:
   window.SUPABASE_URL = "https://TWOJ-PROJEKT.supabase.co";
   window.SUPABASE_ANON_KEY = "TWÓJ_KLUCZ_ANON_PUBLIC";
3. Zapisz plik.
Używaj wyłącznie klucza anon/public. Nigdy nie wklejaj klucza service_role do strony.

KROK 3 — OPUBLIKUJ GRĘ
Najprościej:
1. Załóż konto na https://github.com/ (jeśli jeszcze go nie masz).
2. Utwórz nowe repozytorium, np. tygrys-kontra-mors.
3. Wgraj wszystkie pliki i folder assets z tej paczki.
4. W repozytorium otwórz Settings -> Pages.
5. W sekcji Build and deployment wybierz Deploy from a branch.
6. Wybierz branch main i folder /(root), a następnie Save.
7. Po chwili GitHub pokaże publiczny adres strony.

KROK 4 — ZAGRAJCIE!
1. Otwórz opublikowany adres gry.
2. Pierwszy gracz klika UTWÓRZ POKÓJ i kopiuje link.
3. Wysyła link drugiemu graczowi.
4. Drugi gracz otwiera link — dołącza jako Mors.
5. Tygrys zaczyna. Ruchy i plansza aktualizują się na obu urządzeniach.

ZASADY
- Tygrys = kółko i zaczyna.
- Mors = krzyżyk.
- Gra wykrywa wygraną i remis.
- Po zakończeniu można kliknąć REWANŻ.
- Wynik punktowy jest liczony lokalnie w danej przeglądarce, nie jest globalnym rankingiem.

UWAGA TECHNICZNA
To jest lekka wersja startowa dla prywatnej/zabawowej gry. Dostęp do tabeli jest publiczny,
a kod pokoju pełni rolę identyfikatora, nie hasła. Nie używaj tej konfiguracji do danych
poufnych ani krytycznych. Przy większym ruchu lub publicznym turnieju warto dodać
uwierzytelnianie, ograniczenia częstotliwości i walidację ruchów po stronie serwera.

Jeśli chcesz, można później dodać ranking online, nazwy graczy, dźwięki, animacje
zwycięstwa i bardziej dopracowaną planszę.
