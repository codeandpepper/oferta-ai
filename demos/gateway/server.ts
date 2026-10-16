// One Heroku app, many demos. The gateway is the only `web` process (Heroku routes HTTP only there):
// `/<name>/...` is proxied to that demo's own process, started on first request and stopped when idle.
// The demo sees paths without the prefix (`/axians/api/x` → `/api/x`) and gets BASE_PATH=/axians.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, createServer as createNetServer, type Socket } from "node:net";
import { loadDemos, demoEnv, type Demo } from "./demos.ts";

const PORT = Number(process.env.PORT ?? 8080);
const IDLE_MS = Number(process.env.DEMO_IDLE_MINUTES ?? 30) * 60_000; // 0 = never stop
const START_TIMEOUT_MS = 60_000;
const PROD = process.env.NODE_ENV === "production";

const demos = loadDemos();
const log = (name: string, msg: string) => console.log(`[${name}] ${msg}`);

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createNetServer().once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
}

const canConnect = (port: number) =>
  new Promise<boolean>((ok) => {
    const s = connect(port, "127.0.0.1", () => (s.destroy(), ok(true)));
    s.once("error", () => ok(false));
  });

class Runner {
  port = 0;
  active = 0;
  lastUsed = 0;
  private proc?: ChildProcess;
  private ready?: Promise<void>;
  readonly demo: Demo;

  constructor(demo: Demo) {
    this.demo = demo;
  }

  get base() { return `/${this.demo.name}`; }
  get running() { return !!this.proc; }

  /** Starts the demo if needed; concurrent callers share one start. */
  ensure(): Promise<void> {
    this.lastUsed = Date.now();
    return (this.ready ??= this.start().catch((e) => {
      this.stop();
      throw e;
    }));
  }

  private async start() {
    this.port = await freePort();
    log(this.demo.name, `start: ${this.demo.start} (port ${this.port})`);
    const env = { ...demoEnv(this.demo, demos), PORT: String(this.port), BASE_PATH: this.base };
    // detached → own process group, so `npm start` & co. die together with their children
    const proc = spawn(this.demo.start, { cwd: this.demo.dir, env, shell: true, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    for (const stream of [proc.stdout, proc.stderr])
      stream.on("data", (b: Buffer) => b.toString().trimEnd().split("\n").forEach((l) => log(this.demo.name, l)));
    let exited = false;
    proc.once("exit", (code, signal) => {
      exited = true;
      log(this.demo.name, `zakończony (${signal ?? code})`);
      if (this.proc === proc) (this.proc = undefined), (this.ready = undefined);
    });
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (!(await canConnect(this.port))) {
      if (exited) throw new Error(`Demo „${this.demo.name}” zakończyło się przy starcie — szczegóły w logach`);
      if (Date.now() > deadline) throw new Error(`Demo „${this.demo.name}” nie wystartowało w ${START_TIMEOUT_MS / 1000} s`);
      await new Promise((r) => setTimeout(r, 200));
    }
    log(this.demo.name, `gotowe po ${((Date.now() - deadline + START_TIMEOUT_MS) / 1000).toFixed(1)} s`);
  }

  stop() {
    const proc = this.proc;
    this.proc = undefined;
    this.ready = undefined;
    if (proc?.pid && proc.exitCode === null) {
      try { process.kill(-proc.pid, "SIGTERM"); } catch {}
    }
  }
}

const runners = new Map(demos.map((d) => [d.name, new Runner(d)]));

// Demos don't need to know their prefix for redirects/cookies: absolute `Location: /x` and
// `Path=/` cookies are moved under the prefix (so two demos never share a cookie either).
function rewriteHeaders(headers: IncomingMessage["headers"], base: string) {
  const loc = headers.location;
  if (typeof loc === "string" && loc.startsWith("/") && !loc.startsWith("//") && loc !== base && !loc.startsWith(base + "/"))
    headers.location = base + loc;
  const cookies = headers["set-cookie"];
  if (cookies) headers["set-cookie"] = cookies.map((c) => c.replace(/;\s*path=\/(?=;|$)/i, `; Path=${base}`));
  return headers;
}

function forwardHeaders(req: IncomingMessage, r: Runner) {
  return { ...req.headers, host: `127.0.0.1:${r.port}`, "x-forwarded-prefix": r.base, "x-forwarded-host": req.headers["x-forwarded-host"] ?? req.headers.host };
}

/** Splits `/axians/api/x?q` into the runner and `/api/x?q`; `undefined` = not a demo path. */
function route(url: string): { runner: Runner; path: string } | { redirect: string } | undefined {
  const m = /^\/([^/?#]+)(\/[^?#]*)?(\?.*)?$/.exec(url);
  const runner = m && runners.get(m[1]);
  if (!runner) return;
  if (!m[2]) return { redirect: `${runner.base}/${m[3] ?? ""}` }; // relative URLs in the demo need the trailing slash
  return { runner, path: m[2] + (m[3] ?? "") };
}

function page(res: ServerResponse, status: number, title: string, body: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
  res.end(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
:root{--bg:#f3f4f6;--surface:#fff;--text:#15171a;--muted:#6b7280;--border:#e2e5ea;--accent:#0f62fe}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--surface:#181b21;--text:#e8eaed;--muted:#9aa3ae;--border:#2b3038;--accent:#4589ff}}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif;padding:48px 16px;box-sizing:border-box}
main{max-width:560px;margin:0 auto;display:grid;gap:12px}h1{margin:0 0 8px;font-size:20px}p{margin:0;color:var(--muted)}
a.card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;color:inherit;text-decoration:none}
a.card:hover{border-color:var(--accent)}a.card b{color:var(--accent)}small{color:var(--muted)}</style></head>
<body><main>${body}</main></body></html>`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function index(res: ServerResponse) {
  // The URL is public: in production don't reveal which clients have demos here.
  if (PROD) return page(res, 200, "Code & Pepper — demo", "<h1>Code &amp; Pepper — demo</h1><p>Poproś o bezpośredni link do swojego demo.</p>");
  const cards = [...runners.values()].map(
    (r) => `<a class="card" href="${r.base}/"><b>${esc(r.demo.title)}</b> <small>${r.base}/ · ${r.running ? "działa" : "uśpione"}</small>${r.demo.description ? `<p>${esc(r.demo.description)}</p>` : ""}</a>`,
  );
  page(res, 200, "Demo — lokalnie", `<h1>Demo (lokalnie)</h1>${cards.join("") || "<p>Brak demo — dodaj folder z plikiem demo.json.</p>"}`);
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  if (url === "/" || url.startsWith("/?")) return index(res);
  if (url === "/healthz") return res.writeHead(200, { "content-type": "text/plain" }).end("ok");
  const hit = route(url);
  if (!hit) return page(res, 404, "Nie znaleziono", "<h1>Nie znaleziono</h1><p>Nie ma tu takiego demo.</p>");
  if ("redirect" in hit) return res.writeHead(301, { location: hit.redirect }).end();

  const { runner: r, path } = hit;
  try {
    await r.ensure();
  } catch (e) {
    console.error(e);
    return page(res, 502, "Demo niedostępne", `<h1>Demo chwilowo niedostępne</h1><p>${esc(e instanceof Error ? e.message : String(e))}</p>`);
  }
  r.active++;
  let done = false;
  const finish = () => {
    if (!done) (done = true), r.active--, (r.lastUsed = Date.now());
  };
  res.once("close", finish);
  const upstream = request({ host: "127.0.0.1", port: r.port, method: req.method, path, headers: forwardHeaders(req, r) }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.statusMessage, rewriteHeaders(up.headers, r.base));
    up.pipe(res); // streams as it comes (SSE etc.) — no buffering
  });
  upstream.once("error", (e) => {
    log(r.demo.name, `proxy: ${e.message}`);
    if (!res.headersSent) page(res, 502, "Demo niedostępne", "<h1>Demo chwilowo niedostępne</h1><p>Odśwież stronę za chwilę.</p>");
    else res.destroy();
  });
  req.pipe(upstream);
});

// WebSockets: replay the handshake to the demo with the stripped path, then pipe raw bytes both ways.
server.on("upgrade", async (req: IncomingMessage, socket: Socket, head: Buffer) => {
  const hit = route(req.url ?? "/");
  if (!hit || "redirect" in hit) return socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
  const { runner: r, path } = hit;
  try {
    await r.ensure();
  } catch {
    return socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  }
  const up = connect(r.port, "127.0.0.1", () => {
    const headers = Object.entries(forwardHeaders(req, r)).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `${k}: ${x}`) : [`${k}: ${v}`]));
    up.write(`${req.method} ${path} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  r.active++;
  let done = false;
  const finish = () => {
    if (!done) (done = true), r.active--, (r.lastUsed = Date.now()), up.destroy(), socket.destroy();
  };
  up.once("error", finish).once("close", finish);
  socket.once("error", finish).once("close", finish);
});

if (IDLE_MS > 0)
  setInterval(() => {
    for (const r of runners.values())
      if (r.running && r.active === 0 && Date.now() - r.lastUsed > IDLE_MS) {
        log(r.demo.name, `usypiam po ${IDLE_MS / 60_000} min bezczynności`);
        r.stop();
      }
  }, 60_000).unref();

// Heroku sends SIGTERM on restart/deploy and kills after 30 s — take the demos down with us.
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.once(sig, () => {
    for (const r of runners.values()) r.stop();
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  });

server.listen(PORT, () => console.log(`gateway na http://localhost:${PORT} · demo: ${demos.map((d) => `/${d.name}/`).join(", ") || "brak"}`));
