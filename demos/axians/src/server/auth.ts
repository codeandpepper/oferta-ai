// Password-only gate (no username): a tiny login page sets a cookie.
// Active only in production (Heroku sets NODE_ENV=production) and when DEMO_PASSWORD is set.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const COOKIE = "demo_auth";

function page(error = false) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wiedza serwisowa — demo</title><style>
:root{--bg:#f3f4f6;--surface:#fff;--text:#15171a;--muted:#6b7280;--border:#e2e5ea;--accent:#0f62fe;--err:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--surface:#181b21;--text:#e8eaed;--muted:#9aa3ae;--border:#2b3038;--accent:#4589ff}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif;padding:16px;box-sizing:border-box}
form{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:340px;display:grid;gap:12px}
h1{margin:0;font-size:18px}h1 span{color:var(--accent)}p{margin:0;color:var(--muted);font-size:14px}
input{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)}
button{font:inherit;font-weight:600;padding:10px;border-radius:8px;border:0;background:var(--accent);color:#fff;cursor:pointer}
.err{color:var(--err);font-size:14px}</style></head><body>
<form method="post" action="/login"><h1><span>◆</span> Wiedza serwisowa</h1><p>Podaj hasło, aby otworzyć demo.</p>
<input type="password" name="password" placeholder="Hasło" autofocus required autocomplete="current-password">
${error ? '<div class="err">Nieprawidłowe hasło.</div>' : ""}<button type="submit">Wejdź</button></form></body></html>`;
}

export function passwordGate(app: Hono) {
  const password = process.env.DEMO_PASSWORD;
  if (!password || process.env.NODE_ENV !== "production") return;
  const token = createHash("sha256").update(`axians-demo:${password}`).digest("hex");
  const valid = (v: string | undefined) => !!v && v.length === token.length && timingSafeEqual(Buffer.from(v), Buffer.from(token));

  app.get("/login", (c) => c.html(page()));
  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    if (body.password !== password) return c.html(page(true), 401);
    setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return c.redirect("/");
  });
  app.use("*", async (c, next) => {
    if (valid(getCookie(c, COOKIE))) return next();
    if (c.req.path.startsWith("/api/")) return c.json({ error: "Sesja wygasła — odśwież stronę i podaj hasło." }, 401);
    return c.redirect("/login");
  });
}
