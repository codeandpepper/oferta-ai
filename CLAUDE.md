# Oferta AI — instrukcje dla Claude w tym repo

Repo to wspólny workspace zespołu (dashboard na GitHub Pages) do zbierania
kontekstu pod projekt "oferta AI". Kilka osób pracuje tu równolegle na
swoich Claude Code, każdy push trafia na `main` i od razu widać zmiany na
stronie.

## TWARDE ZASADY — STOSUJ ZAWSZE PRZY KOMMITOWANIU

- WYMUŚ prefiks w KAŻDYM commit message: `add:` / `update:` / `research:`
  (szczegóły formatu niżej w "Praca zespołowa — jak pushujemy"). Commit
  BEZ prefiksu jest niepoprawny — popraw go zanim zrobisz push.
- NIGDY nie wklejaj surowej treści źródeł do `main.md`. `main.md` = TYLKO
  podsumowanie.
- ZAWSZE nowa wiedza/research/link/plik → NOWY plik w `pliki/`. NIE
  nadpisuj i NIE dopisuj do istniejących plików źródłowych.
- NIGDY nie commituj surowego transkryptu czatu — commituj tylko gotowy
  efekt pracy (plik z research/streszczeniem, aktualizacja `main.md`).

## Struktura

- `main.md` — **tylko podsumowanie**. Krótkie, wysokopoziomowe streszczenie
  założeń projektu i aktualnego stanu wiedzy. Nigdy nie wklejaj tu surowych
  danych, długich cytatów ani pełnej treści źródeł — to ma się dać przeczytać
  w minutę.
- `links.md` — lista linków do stron/dokumentów, które są dla nas kontekstem.
- `pliki/` — folder źródłowy: dokumenty, notatki, wyniki scrapowania,
  cokolwiek istotnego dla oferty. Strona automatycznie listuje jego
  zawartość (rekurencyjnie, przez GitHub API), więc nowe pliki od razu
  są widoczne i klikalne na dashboardzie.

## Jak pracować z linkami z `links.md`

Kiedy w `links.md` pojawi się nowy link (dodany przez Ciebie lub kogoś
innego w historii commitów):

1. Wejdź na stronę (WebFetch / przeglądanie), przeczytaj/zeskanuj treść.
2. Zapisz wyciąg jako nowy plik bezpośrednio w `pliki/` (płasko, bez
   podfolderów — patrz "Organizacja `pliki/`" niżej). W pliku umieść:
   - link źródłowy i datę pobrania
   - krótkie streszczenie
   - najważniejsze fragmenty / dane, które mogą się przydać do oferty
3. Nie zostawiaj tego tylko w kontekście rozmowy — ma trafić do repo jako
   plik, żeby reszta zespołu (i przyszłe sesje Claude) miały do tego dostęp.

## Jak pracować z plikami z `pliki/`

Gdy ktoś wrzuci nowy plik (pdf, docx, obraz, txt, cokolwiek) do `pliki/`:

1. Przeczytaj / przeanalizuj zawartość (jeśli to obraz — opisz co na nim jest
   istotnego, jeśli dokument — wyciągnij kluczowe treści).
2. Jeśli z pliku wynika coś, co warto mieć jako osobną notatkę (np.
   wyciąg, analiza, transkrypcja) — zapisz to jako **nowy plik** obok, nie
   nadpisuj oryginału.

## Zasada ogólna

- Domyślnie: nowa wiedza / research / notatka → **nowy plik w `pliki/`**,
  nie edycja istniejących plików źródłowych.
- `main.md` aktualizuj tylko wtedy, gdy trzeba odświeżyć ogólne
  podsumowanie — dopisz 1-2 zdania albo punkt, z odwołaniem do pliku w
  `pliki/`, który ma szczegóły. Nie przenoś tam treści źródeł.
- Pisz pliki w markdown, z sensowną nazwą (kebab-case, bez spacji), żeby
  dobrze się wyświetlały na dashboardzie.

## Organizacja `pliki/`

Folder jest **płaski, bez podfolderów**. Nazwa pliku ma sama mówić co to
jest, np.:

- `2026-09-25-konkurent-x-cennik.md`
- `2026-09-25-artykul-trendy-ai.md`
- `research-grupa-docelowa-msp.md`

Prefiks daty ułatwia sortowanie i widać od razu co jest świeże.

## Praca zespołowa — jak pushujemy

- Każdy pracuje w swoim własnym Claude Code, na swoim laptopie/koncie.
  Push idzie **bezpośrednio na `main`** — bez PR i review. Przy małym
  zespole to najszybsze; jeśli dwie osoby zedytują ten sam plik w tym
  samym momencie, git da radę zwykłym merge'em albo trzeba go ręcznie
  rozwiązać — to akceptowalne, nie blokujemy na tym przepływu.
- **Push tylko gotowe artefakty, nie surowy czat.** Sesja Claude Code
  danej osoby to jej robocza rozmowa — nie wrzucamy transkryptów czatu do
  repo. Efekt pracy (research, wyciąg z linku, analiza pliku, podsumowanie)
  ląduje jako konkretny plik w `pliki/` albo krótka aktualizacja `main.md`.
- **Limitów rozmiaru/typu plików na razie nie ma** — wrzucaj co potrzeba.
  Jeśli repo zacznie się robić ciężkie (duże wideo, dziesiątki MB PDF-ów),
  wróćmy do tego i ustalmy limit wtedy.
- **WYMAGANY prefiks w commit message** — bez wyjątków, żeby dało się
  przeskanować historię bez otwierania każdego commita:
  - `add: <co dodano>` — nowy plik/link/źródło, np.
    `add: pliki/2026-09-25-konkurent-x-cennik.md`
  - `update: <co zaktualizowano>` — zmiana istniejącego pliku, np.
    `update: main.md — nowy punkt o grupie docelowej`
  - `research: <co>` — commit będący wynikiem researchu/analizy Claude,
    jeśli warto to odróżnić od ręcznego wrzucenia pliku przez człowieka
  - PRZED każdym `git commit` SPRAWDŹ, czy message zaczyna się od
    jednego z tych trzech prefiksów. Jeśli nie — popraw przed commitem.
