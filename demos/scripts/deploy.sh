#!/usr/bin/env bash
# Per-demo Heroku deploy onto the shared app.
#
#   npm run deploy -- <demo>             # from demos/ (or `npm run deploy` inside a demo that defines it)
#   npm run deploy -- <demo> --gateway   # also ship the local gateway (demos/gateway, package.json, Procfile)
#   npm run deploy -- <demo> --remove    # take the demo off the app
#   HEROKU_APP=x HEROKU_TEAM=y npm run deploy -- <demo>
#
# The app runs one slug, so per demo means: clone what is deployed now (Heroku's git repo),
# replace ONLY demos/<demo>/ with the local copy, push on top. Other demos stay exactly as deployed —
# whatever their authors have (or haven't) committed locally. Idempotent; a no-change deploy pushes nothing.
#   1. refuses to touch an app outside HEROKU_TEAM (never deploys to a personal account by accident),
#   2. creates the app in that team (EU) if it doesn't exist yet (first deploy also ships the gateway),
#   3. copies demos/<demo>/.env into config vars with the demo's prefix (DEMO_PASSWORD → AXIANS_DEMO_PASSWORD),
#   4. runs the demo's "check" from demo.json locally,
#   5. pushes; Heroku rebuilds the slug and restarts the dyno (every demo restarts — one app, one dyno),
#   6. keeps exactly one always-on dyno (basic: doesn't sleep, unlike eco).
set -euo pipefail

APP="${HEROKU_APP:-codeandpepper-demos}"
TEAM="${HEROKU_TEAM:-code-and-pepper}"
REGION="${HEROKU_REGION:-eu}"
DYNO_TYPE="${HEROKU_DYNO:-basic}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf "\n\033[1;34m▸ %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const v=new Function("d","return "+process.argv[1])(JSON.parse(d));console.log(v??"")})' "$1"; }

DEMO="" GATEWAY=0 REMOVE=0
for arg in "$@"; do
  case "$arg" in
    --gateway) GATEWAY=1 ;;
    --remove) REMOVE=1 ;;
    -*) fail "Nieznana opcja: $arg" ;;
    *) [ -z "$DEMO" ] || fail "Podaj jedno demo naraz"; DEMO="${arg%/}" ;;
  esac
done
AVAILABLE="$(ls -d */demo.json 2>/dev/null | sed 's#/demo.json##' | tr '\n' ' ')"
[ -n "$DEMO" ] || fail "Podaj demo: npm run deploy -- <nazwa>   (dostępne: ${AVAILABLE:-brak})"
[ "$REMOVE" = 1 ] || [ -f "$DEMO/demo.json" ] || fail "Brak $DEMO/demo.json (dostępne: ${AVAILABLE:-brak})"
PREFIX="$(echo "$DEMO" | tr 'a-z-' 'A-Z_')_"

command -v heroku >/dev/null || fail "Brak Heroku CLI: brew install heroku/brew/heroku"
heroku auth:whoami >/dev/null 2>&1 || fail "Nie jesteś zalogowany: heroku login"
heroku teams --json | json "d.map(t=>t.name).join(' ')" | tr ' ' '\n' | grep -qx "$TEAM" \
  || fail "Nie należysz do teamu Heroku „$TEAM” (heroku teams) — poproś admina o zaproszenie"

say "Aplikacja Heroku: $APP (team $TEAM)"
if INFO="$(heroku apps:info -a "$APP" --json 2>/dev/null)"; then
  OWNER_TEAM="$(echo "$INFO" | json "d.app.team?.name")"
  [ "$OWNER_TEAM" = "$TEAM" ] || fail "Aplikacja $APP nie należy do teamu $TEAM (właściciel: ${OWNER_TEAM:-konto prywatne}) — przerywam"
  echo "  istnieje"
else
  [ "$REMOVE" = 0 ] || fail "Aplikacja $APP nie istnieje"
  heroku create "$APP" --team "$TEAM" --region "$REGION" \
    || fail "Nie udało się utworzyć $APP (nazwa zajęta albo brak uprawnień w teamie $TEAM)"
fi
# Python first, Node last: Node is the primary language (gateway), so its defaults win and the
# Procfile decides the processes. Python is there for demos written in Python.
BUILDPACKS="heroku/python heroku/nodejs"
if [ "$(heroku buildpacks -a "$APP" --json | json "d.map(b=>b.buildpack.name).join(' ')")" != "$BUILDPACKS" ]; then
  heroku buildpacks:clear -a "$APP" >/dev/null
  for bp in $BUILDPACKS; do heroku buildpacks:add -a "$APP" "$bp" >/dev/null; done
  echo "  buildpacki: $BUILDPACKS"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
say "Pobieram to, co jest teraz wdrożone"
git clone -q "https://git.heroku.com/$APP.git" "$TMP/app" 2>/dev/null || fail "Nie mogę pobrać repo git.heroku.com/$APP.git"
cd "$TMP/app"
if git rev-parse -q --verify HEAD >/dev/null; then
  echo "  demo na Heroku: $(ls -d */demo.json 2>/dev/null | sed 's#/demo.json##' | tr '\n' ' ')"
else
  git checkout -q -b main
  echo "  pierwszy deploy — wysyłam też gateway"
  GATEWAY=1
fi
[ -f gateway/server.ts ] || GATEWAY=1
cd "$ROOT"
# the python buildpack fails without a root requirements.txt — bring it along even without --gateway
for f in requirements.txt .python-version; do [ -f "$TMP/app/$f" ] || cp "$f" "$TMP/app/"; done

if [ "$REMOVE" = 1 ]; then
  [ -d "$TMP/app/$DEMO" ] || fail "Demo $DEMO nie jest wdrożone"
  rm -rf "${TMP:?}/app/$DEMO"
  MSG="remove $DEMO"
else
  say "Config vars (${PREFIX}…)"
  if [ -f "$DEMO/.env" ]; then
    VARS=()
    while IFS= read -r line || [ -n "$line" ]; do
      [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
      key="${line%%=*}"; val="${line#*=}"
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ -n "$val" ] || continue
      VARS+=("$PREFIX$key=$val")
    done < "$DEMO/.env"
    grep -qE '^DEMO_PASSWORD=.+' "$DEMO/.env" || echo "  (uwaga: brak DEMO_PASSWORD w .env — demo będzie bez hasła)"
    [ ${#VARS[@]} -eq 0 ] || heroku config:set -a "$APP" "${VARS[@]}" >/dev/null
    echo "  ${#VARS[@]} zmiennych z $DEMO/.env"
  else
    echo "  brak $DEMO/.env — zostawiam config vars bez zmian"
  fi

  CHECK="$(json "d.check" < "$DEMO/demo.json")"
  if [ -n "$CHECK" ]; then
    say "Sprawdzam $DEMO lokalnie: $CHECK"
    [ -d "$DEMO/node_modules" ] || (cd "$DEMO" && npm ci --silent)
    (cd "$DEMO" && bash -c "$CHECK" >/dev/null) || fail "$DEMO: check nie przeszedł"
  fi

  rsync -a --delete --exclude node_modules --exclude dist --exclude .env --exclude .git --exclude .model-cache --exclude .deps --exclude .venv --exclude __pycache__ "$DEMO/" "$TMP/app/$DEMO/"
  MSG="deploy $DEMO"
fi

if [ "$GATEWAY" = 1 ]; then
  rsync -a --delete gateway/ "$TMP/app/gateway/"
  cp package.json package-lock.json Procfile .gitignore requirements.txt .python-version "$TMP/app/"
  MSG="$MSG + gateway"
fi
# the gateway must still accept the set of demos (e.g. no env-prefix clash between names)
node --input-type=module -e "(await import('$TMP/app/gateway/demos.ts')).loadDemos()" || fail "Gateway odrzuca zestaw demo — szczegóły wyżej"

say "Wysyłam: $MSG"
cd "$TMP/app"
git add -A
if git diff --cached --quiet; then
  echo "  brak zmian w kodzie względem wdrożonej wersji — nic nie wysyłam"
else
  git diff --cached --stat | tail -1 | sed 's/^/  /'
  AUTHOR="$(git -C "$ROOT" config user.name || echo deploy)"
  git -c user.name="$AUTHOR" -c user.email="deploy@local" commit -qm "$MSG ($(date +%F_%H%M))"
  git push -q origin main || fail "Push odrzucony — ktoś właśnie zrobił deploy. Uruchom ponownie."
fi
cd "$ROOT"

say "Dyno"
heroku ps:type -a "$APP" "web=$DYNO_TYPE" >/dev/null 2>&1 || true
heroku ps:scale -a "$APP" web=1 >/dev/null

URL="$(heroku apps:info -a "$APP" --json | json "d.app.web_url")"
say "Gotowe"
if [ "$REMOVE" = 1 ]; then
  echo "  $DEMO usunięte z $APP. Zmienne zostały — usuń je: heroku config -a $APP | grep ^$PREFIX"
else
  echo "  ${URL%/}/$DEMO/"
fi
echo "  logi: heroku logs --tail -a $APP   (linie z prefiksem [$DEMO])"
