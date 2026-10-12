#!/usr/bin/env bash
# One-command Heroku deploy of the Axians demo.
#
#   npm run deploy                 # app name: cp-axians-demo
#   HEROKU_APP=my-name npm run deploy
#
# What it does (idempotent — safe to re-run after every change):
#   1. creates the Heroku app (EU region) if it doesn't exist yet,
#   2. copies ANTHROPIC_API_KEY / ELEVENLABS_API_KEY / CLAUDE_MODEL / DEMO_PASSWORD
#      from .env into Heroku config vars (DEMO_PASSWORD defaults to "axians"),
#   3. snapshots this folder (without node_modules, dist, .env) into a temp git repo
#      and force-pushes it to Heroku — no commits to the main repo needed,
#   4. keeps exactly one always-on dyno (basic: doesn't sleep, unlike eco).
set -euo pipefail

APP="${HEROKU_APP:-cp-axians-demo}"
REGION="${HEROKU_REGION:-eu}"
DYNO_TYPE="${HEROKU_DYNO:-basic}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf "\n\033[1;34m▸ %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

command -v heroku >/dev/null || fail "Brak Heroku CLI: brew install heroku/brew/heroku"
heroku auth:whoami >/dev/null 2>&1 || fail "Nie jesteś zalogowany: heroku login"
[ -f .env ] || fail "Brak .env (skopiuj .env.example i uzupełnij klucze)"

env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
ANTHROPIC_API_KEY="$(env_get ANTHROPIC_API_KEY)"
ELEVENLABS_API_KEY="$(env_get ELEVENLABS_API_KEY)"
CLAUDE_MODEL="$(env_get CLAUDE_MODEL)"
DEMO_PASSWORD="$(env_get DEMO_PASSWORD)"
[[ "$ANTHROPIC_API_KEY" == sk-ant-* ]] || fail "ANTHROPIC_API_KEY w .env nie wygląda na klucz Anthropic (sk-ant-…)"
[ -n "$ELEVENLABS_API_KEY" ] || echo "  (uwaga: brak ELEVENLABS_API_KEY — dyktowanie nie będzie działać)"

if [ -z "$DEMO_PASSWORD" ]; then
  DEMO_PASSWORD="axians"
  if grep -qE '^DEMO_PASSWORD=' .env; then sed -i '' "s/^DEMO_PASSWORD=.*/DEMO_PASSWORD=$DEMO_PASSWORD/" .env; else echo "DEMO_PASSWORD=$DEMO_PASSWORD" >> .env; fi
  echo "  ustawiono DEMO_PASSWORD=axians i zapisano w .env"
fi

say "Sprawdzam build lokalnie"
npx tsc --noEmit
npx vite build >/dev/null

say "Aplikacja Heroku: $APP"
if heroku apps:info -a "$APP" >/dev/null 2>&1; then
  echo "  istnieje"
else
  heroku create "$APP" --region "$REGION" --buildpack heroku/nodejs
fi

say "Config vars"
heroku config:set -a "$APP" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" \
  CLAUDE_MODEL="${CLAUDE_MODEL:-claude-opus-5-5}" \
  DEMO_PASSWORD="$DEMO_PASSWORD" >/dev/null
echo "  ustawione"

say "Wysyłam kod"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .env --exclude '.git' ./ "$TMP/"
(
  cd "$TMP"
  git init -q -b main
  git add -A
  git -c user.name="deploy" -c user.email="deploy@local" commit -qm "deploy $(date +%F_%H%M)"
  git push -q --force "https://git.heroku.com/$APP.git" main
)

say "Dyno"
heroku ps:type -a "$APP" "web=$DYNO_TYPE" >/dev/null 2>&1 || true
heroku ps:scale -a "$APP" web=1 >/dev/null

URL="$(heroku apps:info -a "$APP" --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).app.web_url))')"
say "Gotowe"
echo "  URL:    $URL"
echo "  hasło:  $DEMO_PASSWORD (samo hasło, bez loginu)"
echo "  logi:   heroku logs --tail -a $APP"
