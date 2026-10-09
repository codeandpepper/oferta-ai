# Axians demo — research stacku technicznego

Data: 2026-10-07. Dotyczy demo „Wiedza serwisowa w jednym miejscu”
(`demos/axians/`). Założenia: Heroku, Node.js/TypeScript, możliwie
wszystko lokalnie, SQLite zamiast zewnętrznej bazy, ElevenLabs do głosu,
całość „lekka”.

## Aktualizacja 2026-10-07: pliki JSON zamiast SQLite

Decyzja zespołu: na demo nie używamy żadnej bazy. Dane trzymamy w plikach
JSON (`data/seed/`) wczytywanych do pamięci przy starcie, a nowe
zgłoszenia dopisujemy w pamięci i do `/tmp`. Odpadają `better-sqlite3`,
natywne binarki i text-to-SQL. Persona kierownika zamiast SQL dostaje od
Claude spec zapytania w JSON wykonywany w JS. Wnioski o efemerycznym
filesystemie Heroku i jednym dyno nadal obowiązują. Wzmianki o SQLite
poniżej są nieaktualne.

## Wnioski

- **Heroku + SQLite działa pod warunkiem seedowania przy starcie.**
  Filesystem dyno jest efemeryczny i czyszczony co najmniej raz na dobę
  oraz przy każdym deployu. Każdy dyno ma też własną kopię pliku. Na demo
  to akceptowalne: jeden dyno, baza odtwarzana z commitowanych plików
  seed, nowe zgłoszenia żyją do restartu.
- **Node 24.x** to aktywne LTS na Heroku (EOL 2028-04) i domyślna wersja.
  Limit sluga wzrósł do 1 GB (od 2026-03-04), więc lokalny model
  embeddingów się zmieści.
- **ElevenLabs Scribe** (`POST /v1/speech-to-text`, `model_id: scribe_v2`,
  nagłówek `xi-api-key`, SDK `@elevenlabs/elevenlabs-js`) obsługuje polski
  z bardzo niskim WER, przyjmuje wszystkie popularne formaty audio, a
  `language_code` jest opcjonalny. Do demo wystarczy nagranie z
  przeglądarki wysłane po skończeniu wypowiedzi. Wersja realtime nie jest
  potrzebna.
- **Wyszukiwanie semantyczne lokalnie:** `@huggingface/transformers` z
  modelem `Xenova/multilingual-e5-small` (384 wymiary, 100+ języków, w tym
  polski). Wymaga prefiksów `query: ` / `passage: `. Przy kilkuset
  rekordach nie potrzeba rozszerzenia wektorowego (`sqlite-vec`): wektory
  jako BLOB i cosine w JS.
- **Odrzucone / niepotrzebne:** zewnętrzna baza (Postgres), wektorowa baza
  danych, `sqlite-vec`, frameworki agentowe (LangChain), streaming STT
  realtime, osobne API do embeddingów (kolejny klucz i dostawca).
- **Do rozważenia, jeśli RAM dyno okaże się problemem:** zastąpić
  embeddingi wyszukiwaniem pełnotekstowym SQLite FTS5 z tokenizerem
  `trigram` (częściowo radzi sobie z polską odmianą) i rozszerzaniem
  zapytania przez Claude. Kod źródła `tickets-semantic` ma to umożliwiać
  bez zmian w reszcie aplikacji.

## Do zweryfikowania w trakcie budowy

- Zużycie RAM przez model embeddingów na dyno Basic/Standard-1X (512 MB).
- Jakość e5-small na notatkach technicznych pełnych skrótów i literówek.
  Sprawdzić na wygenerowanym seedzie, zanim zbudujemy UI.

## Źródła

- [Heroku: SQLite3 i efemeryczny filesystem](https://devcenter.heroku.com/articles/sqlite3)
- [Heroku: Node.js support](https://devcenter.heroku.com/articles/nodejs-support)
- [Heroku: slug limit 1 GB](https://devcenter.heroku.com/changelog-items/3612)
- [ElevenLabs: Speech-to-text API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [ElevenLabs: Scribe dla polskiego](https://elevenlabs.io/speech-to-text/polish)
- [Hugging Face: Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)

## Aktualizacja 2026-10-07 (po teście): bez embeddingów

Test lokalnego `Xenova/multilingual-e5-small` (q8) na przykładowych
notatkach technika: zła kolejność wyników (notatka o pompie wyżej niż o
czujniku paliwa dla zapytania o agregat) i ~925 MB RSS procesu, czyli
prawie 2× więcej niż RAM dyno Basic. Zastąpione własnym wyszukiwaniem
leksykalnym (TF-IDF na trigramach znakowych, normalizacja ogonków i
skrótów). Claude dopisuje synonimy do zapytania i ocenia wyniki. Wynik
`npm run eval:retrieval`: 12/13 przypadków OK.
