# Demo AI dla klienta Axians — instrukcje dla Claude

Ten folder (`demos/axians/`) zawiera demo na spotkanie z klientem Axians
(kontakt: Damian). Spotkanie: **piątek 2026-10-09, po 15:00**. Demo musi
być gotowe i przetestowane przed tym terminem.

## TWARDA ZASADA — wszystko o demo Axians zostaje w `demos/axians/`

- KAŻDY plik dotyczący demo Axians (kod, dane, research, notatki ze
  spotkań, analizy, slajdy) zapisuj WYŁĄCZNIE w `demos/axians/`. NIGDY
  nie zapisuj ich w `pliki/` ani w innym miejscu repo.
- Research, notatki i analizy trafiają do `demos/axians/docs/` jako nowe
  pliki markdown z prefiksem daty (np. `2026-10-07-...md`). Ta reguła
  zastępuje tu ogólną zasadę „research → `pliki/`” z głównego
  `CLAUDE.md`.
- Pozostałe zasady z głównego `CLAUDE.md` (prefiksy commitów `add:` /
  `update:` / `research:`, brak surowych transkryptów czatu) obowiązują
  także tutaj.

## Kontekst biznesowy

- **Axians Polska** (grupa VINCI Energies) to integrator IT/OT. W
  portfolio serwisowym mają SAP Field Service Management, SAP EAM, Infor
  EAM, ServiceNow oraz **Axians NEO**: cyfrowe zarządzanie serwisem i
  utrzymaniem ruchu, głęboko zintegrowane z SAP (energetyka, przemysł).
  Robili też portal e-UDT dla UDT.
- **Klient końcowy jest nieznany** i się go nie dowiemy. Wiemy tylko, że
  serwisuje urządzenia przemysłowe, czyli „twardą infrastrukturę
  budowlano-instalacyjno-przesyłową”. Najpewniej chodzi o sieci
  energetyczne, stacje transformatorowe, gazociągi, wodociągi, maszty i
  instalacje budynkowe, a nie o maszyny w fabryce.
- Klient najpewniej ma (albo dostanie) system serwisowy od Axiansa.
  **Demo pokazuje AI jako warstwę nad takim systemem, a nie jego
  konkurencję.** Przekaz: Axians może to sprzedawać jako rozszerzenie
  swoich wdrożeń SAP/NEO, a my dostarczamy warstwę AI.
- Od Damiana wiemy, że **kluczowym źródłem wiedzy klienta jest historia
  zgłoszeń serwisowych w bazie danych**. Dochodzi do tego kilka innych
  źródeł, przede wszystkim dokumentacja.

## Koncepcja demo: „Wiedza serwisowa w jednym miejscu”

Asystent łączy wiele źródeł wiedzy, a historia zgłoszeń jest
najważniejsza. Wszystko po polsku.

1. **Identyfikacja urządzenia (krótko).** Zdjęcie tabliczki znamionowej,
   z którego model odczytuje producenta, typ i numer seryjny. To tylko
   wejście w scenariusz, nie rozbudowujemy tego kroku.
2. **Opis problemu głosem.** Np. „agregat nie startuje, kontrolka paliwa
   miga, wczoraj padało”. Asystent przeszukuje równolegle kilka źródeł i
   składa jedną odpowiedź, w której **każdy fragment ma oznaczone
   źródło**:
   - historia zgłoszeń dla tego typu urządzenia (np. „12 podobnych
     zgłoszeń, w 8 przyczyną była wilgoć w czujniku poziomu paliwa,
     naprawa śr. 1,5 h”),
   - historia zgłoszeń dla tego egzemplarza (np. „ostatni serwis w marcu,
     wymieniono filtr, ślady korozji na złączu”),
   - dokumentacja (DTR): procedura diagnostyczna i kody błędów, z numerem
     strony,
   - jedno dodatkowe źródło (katalog części z zamiennikiem albo procedura
     BHP), żeby pokazać, że architektura jest otwarta.
3. **Zamknięcie zlecenia.** Technik dyktuje chaotyczną notatkę, a AI
   tworzy ustrukturyzowany protokół (czynności, części, czas, zalecenia,
   termin kolejnego przeglądu) i zapisuje go jako nowe zgłoszenie w bazie.
   Format ma przypominać zlecenie w stylu SAP FSM/EAM.
4. **Zamknięcie pętli wiedzy.** To samo pytanie zadane ponownie zwraca
   świeże zgłoszenie w odpowiedzi. System uczy się z każdej interwencji
   bez trenowania modelu. To kluczowy moment demo i musi działać
   niezawodnie.
5. **Druga persona: kierownik serwisu.** Pyta językiem naturalnym, np.
   „które urządzenia miały najwięcej powtórnych awarii w ostatnim
   kwartale?” albo „ile średnio trwa naprawa agregatów u klienta X?”. AI
   odpytuje dane strukturalnie i pokazuje wynik jako tabelkę lub wykres.

Opcjonalnie, jeśli zostanie czas: zdjęcie usterki (korozja, wyciek,
przegrzany zacisk) ze wstępną oceną stanu i propozycją priorytetu.

## Architektura do pokazania (jeden slajd)

Każde źródło ma własny konektor i właściwy sposób przeszukiwania:

- pola strukturalne zgłoszeń (daty, urządzenie, klient, czas naprawy)
  przez **zapytania strukturalne** (w demo: spec zapytania wykonywany w JS;
  u klienta: SQL do jego bazy),
- opisy i notatki techników przez **wyszukiwanie semantyczne**, bo to
  luźny tekst,
- dokumentacja przez **RAG z cytowaniem źródeł** (dokument i strona),
- nowe źródło dokładamy bez przebudowy całości. Dane mogą zostać u
  klienta, a wynik da się wpiąć w SAP FSM/EAM lub ServiceNow.

Kod demo ma odzwierciedlać ten podział: osobny moduł/konektor na każde
źródło i warstwa, która składa odpowiedź z oznaczeniem źródeł.

## Stack techniczny

Zasada: **wszystko lokalnie, co się da, i jak najmniej zależności.** Na
zewnątrz wychodzą tylko dwa API: Claude (LLM) i ElevenLabs (głos).
Uzasadnienie i źródła: `docs/2026-10-07-axians-demo-stack-research.md`.

| Warstwa | Wybór | Uwagi |
|---|---|---|
| Runtime | Node.js 24.x + TypeScript, Heroku | `"engines": {"node": "24.x"}` w `package.json`, `Procfile`: `web: node src/server/index.ts` (Node 24 uruchamia TS bez kompilacji — tylko składnia „erasable”, importy z rozszerzeniem `.ts`) |
| Serwer | Hono (`@hono/node-server`) | Lekki, ma natywny `parseBody` do uploadu audio i zdjęć bez multera |
| Frontend | Jeden statyczny SPA: Vite `vanilla-ts`, bez frameworka | Serwowany przez ten sam serwer; build w `heroku-postbuild` |
| Dane | **Pliki JSON, bez bazy** | `data/seed/*.json` wczytywane do pamięci przy starcie; nowe zgłoszenia w pamięci + dopisywane do `/tmp/tickets.runtime.json`. Zero natywnych zależności |
| LLM | Claude (`@anthropic-ai/sdk`), model `claude-opus-5-5` (zmienna `CLAUDE_MODEL`) | Vision (tabliczka, usterka), tool use (orkiestracja źródeł), structured output (protokół), pytanie → spec zapytania w JSON (kierownik) |
| Speech-to-text | ElevenLabs Scribe, `model_id: scribe_v2`, `language_code: pol` | `POST /v1/speech-to-text`, nagranie z przeglądarki przez `MediaRecorder` (webm/opus) wysyłamy bez konwersji |
| Text-to-speech | Opcjonalnie, ElevenLabs | Tylko jeśli zostanie czas, np. odczytanie podsumowania; nie jest w krytycznej ścieżce |
| Wyszukiwanie w tekście | Własny `src/server/search.ts`: TF-IDF na trigramach znakowych + normalizacja (bez ogonków, rozwijanie skrótów techników) | **Bez embeddingów.** Test 2026-10-07: `multilingual-e5-small` źle rankował notatki i zajmował ~925 MB RAM. Część „semantyczną” robi Claude: pisze zapytanie z synonimami/skrótami i ocenia kandydatów. Jakość sprawdza `npm run eval:retrieval` |
| PDF (DTR) | `unpdf`, tylko w skrypcie offline | Chunki z numerem strony liczone raz i commitowane jako JSON; PDF-y serwowane statycznie, a cytat linkuje do `plik.pdf#page=N` |
| Wykresy | Chart.js | Persona kierownika |
| Pogoda | Open-Meteo (bez klucza, CC BY 4.0 — atrybucja w UI) | `src/server/sources/weather.ts`: 7 dni dla współrzędnych urządzenia (`lat`/`lon` w `devices.json`) albo GPS przeglądarki. **Tryb demo** zwraca zapisany deszczowy tydzień (przewidywalny pokaz). Narzędzie `get_weather` — AI wywołuje je **tylko gdy uzna, że pogoda może mieć związek z usterką** (z podaniem powodu); wtedy karta pogody pojawia się w odpowiedzi, a pogoda jest pierwszą sekcją. Ustawienia (GPS, tryb demo) są w kroku 2 |

### Tab „Technik — voice agent” (ElevenLabs Agents)

Drugie doświadczenie na tej samej warstwie wiedzy: cały przepływ technika
prowadzony głosem przez agenta ElevenLabs (LLM agenta: `claude-sonnet-5-5`,
głos `eleven_flash_v2_5`, polski). Tab kierownika bez zmian.

- Konfiguracja jako pliki: `agent_configs/technik-voice.json` (prompt, głos,
  ASR) i `tool_configs/*.json` — 5 **client tools** wykonywanych w
  przeglądarce (`src/client/voice.ts`), które wołają nasze API:
  `find_device`, `select_device`, `search_service_knowledge` (→ `/api/ask`
  z `fast: true`, model `CLAUDE_FAST_MODEL`), `draft_protocol`, `save_ticket`.
- Wypchnięcie do ElevenLabs: `npm run voice:push` (idempotentne; ID w
  `data/voice-agent.json`). Wymaga `ELEVENLABS_API_KEY` z uprawnieniem
  **Agents: write** (`convai_write`). Agent jest prywatny — przeglądarka
  dostaje krótkotrwały token z `GET /api/voice/token`.
- Zdjęcie tabliczki w tym tabie trafia do agenta jako wiadomość
  „[Zdjęcie tabliczki] …”.
- **Tab jest domyślnie ukryty** (jakość głosu jeszcze nie na pokaz). Włącza go
  parametr `?voice` w adresie, np. `/?voice#voice`. Parametr przetrwa
  logowanie hasłem (strona logowania zwraca na adres z `next`).
- Nie używaj `--dry-run` CLI `elevenlabs` do zapisu — w wersji 1.4.0 mimo
  flagi wysyła żądanie. Pliki `agents.json` / `tools.json` / `tests.json` to
  pusty szkielet z `elevenlabs agents init`; push idzie przez nasz skrypt.

### Architektura w kodzie

- `src/server/sources/` zawiera po jednym module na źródło (`tickets-query.ts`,
  `tickets-semantic.ts`, `docs-rag.ts`, `parts.ts`). Każdy jest
  wystawiony jako narzędzie (tool) dla Claude.
- Claude dostaje pytanie i decyduje, które narzędzia wywołać. Wynik ma
  ustrukturyzowane fragmenty z polem `source`, które frontend renderuje
  jako oznaczenia źródeł.
- Kierownik: Claude NIE generuje SQL ani kodu. Zwraca spec zapytania w
  JSON (`filter`, `groupBy`, `metric`, `sort`, `limit`), walidowany zod i
  wykonywany w JS na tablicy zgłoszeń. W UI „pokaż zapytanie” wyświetla
  ten spec.
- Nie dodawaj frameworków agentowych (LangChain itp.). Wystarczy pętla
  tool use z SDK.

### Heroku: na co uważać

- **Filesystem jest efemeryczny.** Dyno restartuje się co najmniej raz
  na dobę i każdy deploy czyści dane. Dlatego dane są **odtwarzane przy
  starcie** z commitowanych plików seed (`data/seed/*.json`). Zgłoszenia dodane w trakcie demo żyją do restartu i to
  wystarcza. Dodaj w UI przycisk „Reset demo” przywracający stan seed.
- **Tylko jeden dyno `web`** (`heroku ps:scale web=1`). Każdy dyno ma
  własną kopię danych w pamięci.
- **Nie używaj dyno Eco**, bo usypia się i pierwszy request na spotkaniu
  trwałby za długo. Basic wystarczy (bez lokalnego modelu aplikacja
  zajmuje kilkadziesiąt MB RAM).
- Mikrofon i aparat w przeglądarce wymagają HTTPS. Heroku daje go na
  `*.herokuapp.com` od ręki.
- Sekrety tylko w config vars: `ANTHROPIC_API_KEY`,
  `ELEVENLABS_API_KEY`, `DEMO_PASSWORD`. Aplikacja jest za ekranem z samym
  hasłem (`src/server/auth.ts`), bo URL jest publiczny.
- Rozgrzewka: odpal aplikację 10 minut przed spotkaniem i przejdź cały
  scenariusz raz.

### Deploy na Heroku — jedna komenda

`npm run deploy` (skrypt `scripts/deploy-heroku.sh`). Wymaga `heroku login`
i kluczy w `.env`. Skrypt jest idempotentny — uruchamiaj po każdej zmianie:
tworzy aplikację `cp-axians-demo` (EU) jeśli jej nie ma, przenosi klucze z
`.env` do config vars (`DEMO_PASSWORD` domyślnie `axians`), sprawdza
build, pakuje sam folder demo (bez `node_modules`, `dist`, `.env`) do
tymczasowego repo i robi force push na Heroku — **niezależnie od commitów
w głównym repo**. Ustawia 1 dyno `basic` (nie usypia się). Inna nazwa:
`HEROKU_APP=nazwa npm run deploy`. Dostęp: ekran z samym hasłem
(`DEMO_PASSWORD`, bez loginu), cookie ważne 30 dni; działa tylko na
produkcji (`NODE_ENV=production`), lokalnie `npm run dev` jest bez hasła.

### Skrypty offline (uruchamiane lokalnie, wynik commitowany)

- `scripts/generate-tickets.ts` — **deterministyczny** generator (seedowany
  RNG, bez API) syntetycznych zgłoszeń. Wzorce demo są w nim przypięte
  jawnie (sekcja „pinned patterns”), reszta to tło. Wynik:
  `data/seed/tickets.json`. Zmieniasz wzorzec → zmieniasz generator i
  uruchamiasz ponownie, nie edytuj JSON-a ręcznie.
- `scripts/ingest-docs.ts` — PDF-y z `public/docs/` (lista i zakres stron w
  `data/seed/docs.json`) → `data/seed/doc_chunks.json` z numerami stron PDF.
- `scripts/eval-retrieval.ts` — sprawdza, czy wyszukiwanie zwraca
  oczekiwane zgłoszenia i strony DTR. Uruchom po każdej zmianie danych lub
  `search.ts`.

## Dane

Nie mamy żadnych danych klienta, więc wszystko jest syntetyczne albo
publiczne.

- **Syntetyczna baza zgłoszeń:** kilkaset zgłoszeń po polsku dla 2–3 typów
  urządzeń (np. agregat prądotwórczy, transformator, pompa), z kilkoma
  egzemplarzami i klientami. Notatki mają wyglądać jak prawdziwe notatki
  techników: skróty („wym. filtra, ok”), literówki, żargon, niepełne
  wpisy. To jest kluczowe dla wiarygodności demo, więc nie generuj
  wygładzonych, poprawnych tekstów.
- Dane muszą zawierać wzorce, o które demo pyta (np. powtarzająca się
  przyczyna dla danego typu, egzemplarz z historią korozji, urządzenia z
  powtórnymi awariami w ostatnim kwartale). Scenariusz i dane projektuj
  razem.
- **Dokumentacja:** publiczne instrukcje w `public/docs/`, metadane (link
  źródłowy, data pobrania) w `data/seed/docs.json`. `npm run seed:fetch-docs`
  pobiera je ponownie ze źródeł, jeśli trzeba je odświeżyć. Obecnie: FOGO
  (agregaty FV 10001 ER / FV 15540 ER, tabela usterek str. 22) i Grundfos
  MAGNA3 (PL, kody alarmów str. 52) oraz **Bosch BWKA 3 — dokumentacja
  demonstracyjna** (publicznie nie istnieje; źródło HTML w
  `data/docs-src/bosch-bwka3.html`, PDF: `npm run seed:demo-docs`, potem
  `npm run seed:docs`). Jest wyraźnie oznaczona jako materiał demonstracyjny —
  tak ją przedstawiamy. Transformatory (fikcyjne) nie mają DTR.
- **AG-007 Bosch BWKA 3 (1987)** — do pokazu odczytu prawdziwej, obróconej
  tabliczki (`public/samples/tabliczka_znamionowa_agregat.jpg`, przycisk
  „Zdjęcie z terenu”). Historia: szczotki prądnicy, wyciek oleju bez
  dostępnej uszczelki, zalecenie wymiany agregatu (2026-04-22). Części
  `BWK-*` / `USZ-ARK-1.0` w `parts.json`.
- **Scenariusz demo opiera się na AG-003** (FOGO FV 15540 ER, PEC Borówiec):
  12 zgłoszeń „nie uruchamia się” dla agregatów (8× woda w paliwie), a
  ostatnia wizyta AG-003 (2026-03-12) zaleca wymianę złącza czujnika
  poziomu paliwa. Powtórne awarie w Q3 2026: PO-004, PO-005, AG-004.
- **Uniwersalność:** podmiana dokumentu i typów urządzeń (np. gaz zamiast
  energetyki) nie może wymagać zmian w kodzie, tylko w danych.

## Czego NIE robimy

- **Predykcyjnego utrzymania ruchu na danych z czujników.** Bez
  prawdziwych danych wyjdzie sztucznie i łatwo to wypunktować. Najwyżej
  wzmianka na slajdzie jako „kolejny krok, gdy będą dane”.
- Nie budujemy konkurencji dla SAP/NEO (własnych modułów planowania,
  harmonogramów itp.).
- Nie używamy nazw ani danych prawdziwych klientów Axiansa w danych
  syntetycznych.

## Priorytety przy ograniczonym czasie

Demo jest na żywo, więc liczy się niezawodność przepływu, a nie
kompletność:

1. Krok 2 (odpowiedź z wielu źródeł z cytowaniem) i krok 4 (pętla wiedzy).
2. Krok 3 (notatka głosowa → protokół → zapis w bazie).
3. Krok 5 (persona kierownika, zapytanie + wykres).
4. Krok 1 (tabliczka znamionowa).
5. Ocena zdjęcia usterki (opcjonalnie).

Przygotuj tryb awaryjny: nagrane wejścia audio/zdjęcia albo gotowe
przykładowe pliki, żeby demo dało się przeprowadzić bez mikrofonu i
aparatu.

## Pytania do Damiana (na piątek)

- W czym trzymają historię zgłoszeń (SAP, własna baza, Excel)?
- Ile jest tych danych i z ilu lat?
- Czy notatki techników są w wolnym tekście?
- Jakie jeszcze źródła wchodzą w grę poza dokumentacją?

Odpowiedzi pokażą, jak duży może być pilotaż. Po spotkaniu zapisz
wnioski jako nowy plik w `docs/` (np. `docs/2026-10-09-axians-spotkanie-notatki.md`).
