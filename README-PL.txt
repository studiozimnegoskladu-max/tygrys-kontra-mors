TYGRYS KONTRA MORS — WERSJA ROZSZERZONA
Studio Zimnego Składu

NOWOŚCI:
- Gra online na dwa urządzenia (Supabase) — dotychczasowy tryb i pokoje pozostają.
- Trening z komputerem — Mors używa algorytmu minimax i gra bardzo mocno.
- Lokalna gra dla dwóch osób na jednym ekranie.
- Nick gracza zapisywany na danym urządzeniu.
- Efekty dźwiękowe z możliwością wyciszenia.
- Animacja po zakończeniu partii.
- Licznik zwycięstw w bieżącej sesji.
- Układ responsywny na telefon i komputer.

JAK ZAKTUALIZOWAĆ STRONĘ GITHUB PAGES:
1. Otwórz repozytorium GitHub: studiozimnegoskladu-max/tygrys-kontra-mors.
2. Wejdź do repozytorium i wybierz Add file → Upload files.
3. Otwórz folder tygrys-kontra-mors z tej paczki ZIP.
4. Przeciągnij do GitHuba ZAWARTOŚĆ tego folderu: index.html, app.js, style.css, config.js, README-PL.txt, supabase-setup.sql oraz folder assets.
   Ważne: nie wrzucaj nadrzędnego folderu tygrys-kontra-mors jako dodatkowego poziomu.
5. Zatwierdź zmiany przyciskiem Commit changes.
6. Odczekaj 1–3 minuty i odśwież grę skrótem Ctrl+F5.

KONFIGURACJA:
Plik config.js zawiera już dane połączenia z dotychczasowym projektem Supabase.
Nie zmieniaj ich, jeśli obecna gra online działa.
Nie publikuj nigdy klucza service_role. W projekcie używany jest klucz publiczny.

WAŻNE O STATYSTYKACH:
Nick jest zapisywany lokalnie w przeglądarce. Wyniki są liczone w trakcie bieżącej sesji gry. Nie ma jeszcze globalnego rankingu ani kont graczy — do tego potrzebna jest osobna warstwa profili i bezpieczna autoryzacja.

Jeśli po aktualizacji przeglądarka pokazuje starą wersję, wykonaj twarde odświeżenie Ctrl+F5 albo otwórz stronę w oknie prywatnym.
