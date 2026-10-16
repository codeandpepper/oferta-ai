# Oferta AI — instrukcje dla Claude w tym repo

Wspólne repo zespołu Code & Pepper do budowania oferty AI: **dema dla
klientów** i **ogólne materiały ofertowe / wymagania**. Kilka osób pracuje
tu równolegle na swoich Claude Code, push idzie bezpośrednio na `main`.

## TWARDE ZASADY — STOSUJ ZAWSZE PRZY KOMMITOWANIU

- WYMUŚ prefiks w KAŻDYM commit message: `add:` / `update:` / `research:`
  (format niżej). Commit BEZ prefiksu jest niepoprawny — popraw go, zanim
  zrobisz push.
- NIGDY nie commituj surowego transkryptu czatu. Commituj tylko gotowy
  efekt pracy (kod, notatka, research, wymagania).
- NIGDY nie commituj sekretów (klucze API, hasła). Trzymaj je w `.env`
  (w `.gitignore`), a do repo dawaj `.env.example` z pustymi wartościami.

## Struktura

- `demos/` — dema dla klientów, każde we własnym folderze (np.
  `demos/axians/`), wszystkie na jednej apce Heroku. **Przed pracą przy
  demo przeczytaj `demos/CLAUDE.md`** (jak dodać demo, deploy, Heroku CLI
  i team) oraz `CLAUDE.md` w folderze danego demo (kontekst klienta).
  Wszystko o danym demo (kod, dane, research, notatki ze spotkań) zostaje
  w jego folderze.
- Ogólne materiały ofertowe i wymagania, niezwiązane z jednym demo (opis
  oferty, cenniki, wymagania techniczne i biznesowe, case studies,
  research rynku, szablony) — w tematycznych folderach w głównym
  katalogu. Utwórz folder, jeśli pasującego jeszcze nie ma (np. `oferta/`,
  `wymagania/`, `research/`). Nazwy kebab-case, bez spacji.

## Jakie materiały dodawać

Repo przyjmuje każdy materiał, który **dobrze żyje w gicie**, czyli taki,
który da się czytać i porównywać w diffie:

- **Preferowane:** Markdown (`.md`), tekst, CSV, JSON / YAML, diagramy jako
  kod (Mermaid w `.md`, PlantUML), SVG, kod i skrypty.
- **OK, gdy potrzebne:** obrazy (PNG / JPG — zrzuty, zdjęcia, mockupy),
  PDF-y źródłowe (np. dokumentacja do demo). Trzymaj je rozsądnie małe.
- **Unikaj:** dużych binarek (wideo, archiwa, pliki po kilkadziesiąt MB) i
  formatów bez sensownego diffu (`.docx`, `.pptx`, `.xlsx`). Jeśli taki
  plik musi być, dodaj obok jego wersję w Markdown/CSV albo krótkie
  streszczenie, żeby treść była przeszukiwalna. Wideo i duże pliki trzymaj
  poza repo (np. Google Drive), a w repo zostaw link.
- **Linki do źródeł zewnętrznych:** nie zostawiaj samego linku. Zapisz
  wyciąg jako plik `.md` z linkiem źródłowym, datą pobrania, krótkim
  streszczeniem i najważniejszymi fragmentami/danymi.

Nazwy plików: kebab-case, z prefiksem daty dla notatek i researchu, żeby
było widać, co jest świeże, np. `research/2026-10-15-konkurencja-cenniki.md`,
`demos/axians/docs/2026-10-09-axians-spotkanie-notatki.md`. Nowa wiedza →
nowy plik, nie dopisuj do cudzych notatek źródłowych.

## Praca zespołowa — jak pushujemy

- Każdy pracuje w swoim Claude Code, na swoim laptopie/koncie. Push idzie
  **bezpośrednio na `main`**, bez PR i review. Konflikty przy równoległej
  edycji tego samego pliku rozwiązujemy zwykłym merge'em.
- Przed pushem zrób `git pull --rebase`, żeby nie nadpisać cudzej pracy.
- **WYMAGANY prefiks w commit message**, bez wyjątków, żeby dało się
  przeskanować historię bez otwierania każdego commita:
  - `add: <co dodano>` — nowy plik/materiał/demo, np.
    `add: oferta/2026-10-15-cennik-pilotazu.md`
  - `update: <co zaktualizowano>` — zmiana istniejącego pliku, np.
    `update: demos/axians — nowy scenariusz kierownika`
  - `research: <co>` — wynik researchu/analizy Claude, jeśli warto to
    odróżnić od ręcznego wrzucenia pliku przez człowieka
  - PRZED każdym `git commit` SPRAWDŹ, czy message zaczyna się od jednego
    z tych trzech prefiksów. Jeśli nie — popraw przed commitem.
