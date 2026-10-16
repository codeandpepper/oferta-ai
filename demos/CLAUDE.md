# Demos — wiele demo na jednej apce Heroku

Folder `demos/` zawiera dema dla klientów (np. `axians/`, kolejne: `orlen/`
itd.). Każde demo ma **własny, niezależny codebase**, ale wszystkie chodzą
na **jednej apce Heroku `codeandpepper-demos`** w teamie
**`code-and-pepper`**. Płacimy za jeden dyno Basic (~$7/mies.) zamiast
osobnej apki per demo.

Zasady z głównego `CLAUDE.md` (prefiksy commitów `add:` / `update:` /
`research:`, brak surowych transkryptów czatu) obowiązują także tutaj.
Każde demo może mieć własny `CLAUDE.md` z zasadami tylko dla siebie.

## Jak to działa (i dlaczego tak)

Ustalenia z dokumentacji Heroku (2026-10-15):

- **Ruch HTTP dostaje tylko proces `web`**, a apka ma jeden taki proces
  ([Procfile](https://devcenter.heroku.com/articles/procfile)). Nie da się
  zrobić `web-axians` i `web-orlen`, więc wszystko wchodzi przez jeden
  proces: **gateway** (`gateway/server.ts`, czysty Node, zero zależności).
- Gateway routuje **po ścieżce**: `https://<apka>/axians/...` trafia do
  demo `axians`. Demo dostaje ścieżkę **bez prefiksu** (`/axians/api/x` →
  `/api/x`), więc jego serwer nie musi nic wiedzieć o gatewayu.
- Każde demo to **osobny proces potomny** na wewnętrznym porcie.
  **Startuje przy pierwszym wejściu** (zimny start Axians: ~0,2 s) i jest
  **usypiane po 30 min bezczynności** (`DEMO_IDLE_MINUTES`, `0` = nigdy).
  Dzięki temu uśpione demo nie zjada RAM-u.
- **Limity dyno Basic:** 0,5 GB RAM, maks. 256 procesów i wątków razem
  ([dyno types](https://devcenter.heroku.com/articles/dyno-types),
  [process limits](https://devcenter.heroku.com/articles/dyno-scaling-and-process-limits)).
  Po przekroczeniu RAM-u Heroku zgłasza R14 (swap, apka zwalnia), a przy
  dużym przekroczeniu R15 (dyno zabite)
  ([error codes](https://devcenter.heroku.com/articles/error-codes)).
  Proces Node zajmuje zwykle 80–150 MB, więc **naraz działać mogą ~3–4
  demo**. Nie ładuj lokalnych modeli ML do pamięci (embeddingi itp.).
- **Deploy jest per demo** (sekcja „Deploy” niżej): wysyłasz tylko swoje
  demo, a reszta zostaje w wersji, która już chodzi.
- Build: buildpack `heroku/nodejs` buduje `demos/` (`npm run build` →
  `gateway/build.ts`), a ten odpala komendę `build` z `demo.json` każdego
  wdrożonego demo w jego folderze.
- W produkcji strona główna (`/`) **nie pokazuje listy demo**, bo URL jest
  publiczny i nie chcemy zdradzać, dla jakich klientów mamy dema. Klient
  dostaje bezpośredni link `/<nazwa>/`. Lokalnie `/` pokazuje listę.

```
demos/
  package.json, Procfile   ← apka Heroku = gateway (+ requirements.txt, .python-version dla buildpacka Pythona)
  gateway/                 ← server.ts (proxy + procesy), build.ts, demos.ts
  scripts/deploy.sh        ← npm run deploy -- <demo>
  axians/                  ← demo: własny package.json, kod, dane, CLAUDE.md
    demo.json              ← rejestracja demo w gatewayu
  orlen/                   ← demo testowe w Pythonie (hello world)
```

## Kontrakt demo — co musi spełniać nowe demo

1. **Folder `demos/<nazwa>/`**, nazwa kebab-case (`a-z`, `0-9`, `-`). Nazwa
   = prefiks URL (`/<nazwa>/`). Nazwa nie może być początkiem nazwy innego
   demo (`orlen` i `orlen-v2` się gryzą — gateway odmówi startu).
2. **`demo.json`** w folderze demo:

   ```json
   {
     "title": "Orlen — …",
     "description": "Jedno zdanie (widać tylko lokalnie na liście).",
     "start": "node src/server/index.ts",
     "build": "npm ci --include=dev && npm run build",
     "check": "npx tsc --noEmit"
   }
   ```

   - `start` (wymagane) — komenda shell w folderze demo. **Serwer musi
     słuchać na `$PORT`.** Lepiej `node …` niż `npm start` (npm to dodatkowy
     proces i ~40 MB RAM).
   - `build` — odpalane na Heroku przy deployu. `--include=dev`, bo Heroku
     buduje z `NODE_ENV=production` (bez tego nie będzie np. Vite).
   - `check` — odpalane lokalnie przez deploy tego demo przed wysłaniem;
     jak nie przejdzie, deploy się zatrzymuje.
3. **Względne URL-e po stronie przeglądarki.** Strona jest pod
   `/<nazwa>/`, więc w kliencie piszemy `fetch("api/x")`, a nie
   `fetch("/api/x")`. To samo dotyczy obrazków, PDF-ów, linków, `action` w
   formularzach i `location.href`. Vite: `base: "./"`. Gateway sam robi
   przekierowanie `/<nazwa>` → `/<nazwa>/` (bez końcowego `/` względne
   URL-e by nie działały).
4. Po stronie serwera demo nic nie musi wiedzieć o prefiksie. Gateway sam
   poprawia:
   - `Location: /login` → `/<nazwa>/login` (przekierowania),
   - `Set-Cookie: …; Path=/` → `Path=/<nazwa>` (cookie dwóch demo się
     nie mieszają, nawet przy tej samej nazwie).
   Jeśli serwer i tak potrzebuje prefiksu (np. absolutne linki w HTML
   generowanym na serwerze), dostaje go w `BASE_PATH` (np. `/axians`) i w
   nagłówku `X-Forwarded-Prefix`.
5. WebSockety i SSE (streaming) przechodzą przez gateway bez buforowania.
6. **Hasło.** URL jest publiczny, więc każde demo z kluczami API musi
   mieć własną bramkę hasłem (wzór: `axians/src/server/auth.ts`, zmienna
   `DEMO_PASSWORD`).
7. **Stack: Node 24 albo Python 3.14.** Apka ma buildpacki
   `heroku/python` + `heroku/nodejs`, w tej kolejności; skrypt deployu sam
   ich pilnuje
   ([multiple buildpacks](https://devcenter.heroku.com/articles/using-multiple-buildpacks-for-an-app)).
   Na dyno nie ma systemowego Pythona, jest tylko ten z buildpacka.
   - **Python** (wzór: `orlen/`): `"start": "python3 -u server.py"` (`-u`,
     żeby logi szły od razu). Zależności w `<demo>/requirements.txt`,
     instalowane w `build` do folderu demo:
     `python3 -m pip install --target .deps -r requirements.txt`. Przy
     starcie trzeba wtedy ustawić `PYTHONPATH=.deps`, np.
     `"start": "PYTHONPATH=.deps python3 -u server.py"`. Dzięki temu
     każde demo ma własne paczki.
   - Buildpack Pythona wykrywa apkę tylko po `requirements.txt` w
     katalogu głównym apki, czyli w `demos/`. Ten plik i `.python-version`
     należą do wspólnej części, nie dopisuj tam zależności demo.
   - Inny język albo paczki systemowe: kolejny buildpack albo Docker
     (`heroku.yml`). To zmiana dla całej apki, więc najpierw uzgodnij ją z
     zespołem.

## Zmienne środowiskowe i sekrety

- Każde demo trzyma klucze w swoim **`demos/<nazwa>/.env`** (w
  `.gitignore`, nigdy nie commitujemy). Wzór w `.env.example`.
- Na Heroku config vars mają **prefiks demo**: `AXIANS_ANTHROPIC_API_KEY`,
  `ORLEN_DEMO_PASSWORD` itd. Gateway przekazuje każdemu demo **tylko jego
  zmienne, już bez prefiksu** (demo widzi zwykłe `ANTHROPIC_API_KEY`).
  Zmienne innych demo są przed nim ukryte.
- Zmienne **bez prefiksu** (np. `NODE_ENV`) widzą wszystkie demo.
- Deploy demo przenosi **tylko jego** `.env` do config vars z prefiksem.
  Bez lokalnego `.env` zmienne na Heroku zostają bez zmian. Ręcznie:
  `heroku config:set -a codeandpepper-demos ORLEN_X=…`.

## Praca lokalna

- **Pojedyncze demo:** w jego folderze, jego własnymi skryptami (np.
  `cd axians && npm run dev`). Działa pod `/`, bez gatewaya. Dzięki
  względnym URL-om ten sam kod działa w obu miejscach.
- **Całość jak na Heroku:** w `demos/`: `npm run build`, potem
  `npm start` → http://localhost:8080 (lista demo). Zmienne demo podajesz
  z prefiksem, np. `AXIANS_DEMO_PASSWORD=x NODE_ENV=production npm start`
  (bramka hasłem działa tylko z `NODE_ENV=production`).

## Deploy — per demo

```sh
npm run deploy -- axians              # z demos/
npm run deploy                        # z wnętrza demo, jeśli ma skrypt (axians ma)
npm run deploy -- axians --gateway    # + lokalna wersja wspólnej części (gateway/, package.json, Procfile, requirements.txt, .python-version)
npm run deploy -- axians --remove     # zdejmuje demo z apki
```

Jak to działa (`scripts/deploy.sh`): apka ma jeden slug, więc skrypt
pobiera **to, co jest teraz wdrożone** (repo `git.heroku.com/codeandpepper-demos.git`),
podmienia w nim **tylko** `demos/<demo>/` na Twoją lokalną kopię
(bez `node_modules`, `dist`, `.env`) i wypycha to jako nowy commit.
Kolejne kroki:

1. Sprawdza team i apkę (patrz „Heroku CLI” niżej). Jeśli apki nie ma,
   tworzy ją w teamie. Pierwszy deploy wysyła też gateway.
2. Kopiuje `demos/<demo>/.env` do config vars z prefiksem demo.
3. Odpala lokalnie `check` z `demo.json`.
4. Wypycha. Heroku przebudowuje slug i restartuje dyno.

Konsekwencje:

- **Cudze demo zostają nietknięte**, nawet jeśli masz lokalnie ich starą
  wersję albo nie masz ich wcale.
- **Deploy nie zależy od commitów w głównym repo.** Wdrożona wersja to Twój
  working tree. Commituj i pushuj osobno, żeby reszta zespołu miała ten
  sam kod.
- **Gateway jest wspólny**, więc zmieniasz go tylko świadomie, przez
  `--gateway` (po commicie zmian w `gateway/`). Zwykły deploy demo nie
  rusza gatewaya.
- **Restartują się wszystkie demo** (jedna apka, jeden dyno), a Heroku
  przebudowuje wszystkie wdrożone demo, nie tylko Twoje. Nie deployuj w
  trakcie czyjegoś spotkania — uprzedź resztę.
- Brak zmian w kodzie → nic nie jest wysyłane (zmienne z `.env` i tak się
  aktualizują). Jeśli dwie osoby deployują naraz, druga dostaje „Push
  odrzucony” i po prostu uruchamia deploy jeszcze raz.

## Nowe demo — krok po kroku

1. `mkdir demos/<nazwa>` i własny projekt w środku (własny
   `package.json`, `CLAUDE.md` z kontekstem klienta, `.gitignore` z
   `node_modules/`, `dist/`, `.env`).
2. `demo.json` według kontraktu wyżej. Serwer na `$PORT`, względne URL-e,
   bramka hasłem.
3. `.env` z kluczami + `DEMO_PASSWORD`.
4. Lokalny test przez gateway (sekcja wyżej), potem
   `npm run deploy -- <nazwa>` z `demos/`. Opcjonalnie dodaj do
   `package.json` demo skrypt `"deploy": "bash ../scripts/deploy.sh <nazwa>"`.
5. Commit: `add: demos/<nazwa> — …`.

## Heroku CLI — setup i ograniczenie do teamu

Wszystkie nasze apki są w teamie **`code-and-pepper`**. Konto Heroku może
też mieć prywatne apki i inne teamy (np. `fundree`), więc łatwo przez
pomyłkę utworzyć apkę albo wydać komendę nie tam, gdzie trzeba.

1. Instalacja i logowanie:

   ```sh
   brew install heroku/brew/heroku
   heroku login                 # otwiera przeglądarkę
   heroku teams                 # musi być code-and-pepper; jak nie — admin zaprasza
   ```

2. **Domyślny team.** CLI (v11) czyta zmienną `HEROKU_TEAM` jako domyślną
   wartość flagi `--team` (`heroku create`, `heroku apps` itp.). Dopisz do
   `~/.zshrc`:

   ```sh
   export HEROKU_TEAM=code-and-pepper
   ```

   Od tej pory `heroku apps` pokazuje apki teamu, a `heroku create` tworzy
   apkę w teamie, nie na koncie prywatnym.
3. **Zawsze podawaj apkę:** `-a codeandpepper-demos`. `HEROKU_TEAM` to tylko
   wartość domyślna dla `--team`, a nie blokada. Komenda z `-a` na apkę spoza
   teamu nadal zadziała, jeśli masz do niej dostęp.
4. **Twarda blokada jest w skrypcie deployu:** `scripts/deploy.sh`
   sprawdza, czy należysz do teamu i czy apka należy do teamu
   (`HEROKU_TEAM`, domyślnie `code-and-pepper`). Jeśli nie, przerywa, zanim
   cokolwiek zmieni. Nowa apka jest zawsze tworzona z `--team`.

Najczęstsze komendy:

```sh
npm run deploy -- <demo>                         # z demos/: jedno demo na codeandpepper-demos
heroku logs --tail -a codeandpepper-demos        # linie demo mają prefiks [axians] itd.
heroku config -a codeandpepper-demos             # zmienne (z prefiksami demo)
heroku ps -a codeandpepper-demos                 # stan dyno
heroku restart -a codeandpepper-demos            # restart (czyści dane w pamięci demo)
```

## Heroku — na co uważać

- **Adres apki ma losowy sufiks.** Nowe apki dostają domenę typu
  `codeandpepper-demos-1a2b3c4d5e6f.herokuapp.com` (tak jak stara
  `cp-axians-demo-71c9f2a5fe3c.herokuapp.com`). Skrypt deployu wypisuje
  pełne linki do każdego demo.
- **Filesystem jest efemeryczny.** Dyno restartuje się co najmniej raz na
  dobę, a każdy deploy czyści dane. Demo odtwarza stan z commitowanych
  plików seed przy starcie.
- **Jeden dyno `web`, typ Basic** (nie usypia się). Eco usypia się i
  pierwszy request na spotkaniu trwałby za długo.
- **Deploy dowolnego demo restartuje wszystkie demo naraz** (patrz
  „Deploy — per demo”).
- **Router Heroku czeka max 30 s na pierwszy bajt odpowiedzi.** Zimny start
  demo musi być szybki (gateway czeka do 60 s, ale Heroku urwie po 30 s).
  Długie odpowiedzi AI streamuj (SSE), żeby pierwszy bajt poszedł od razu.
- Mikrofon i aparat w przeglądarce wymagają HTTPS — `*.herokuapp.com` ma
  go od ręki.
- Rozgrzewka przed spotkaniem: otwórz demo 10 minut wcześniej (wybudzi
  proces) i przejdź scenariusz raz.
