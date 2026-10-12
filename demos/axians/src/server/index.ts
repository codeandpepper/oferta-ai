import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import Anthropic from "@anthropic-ai/sdk";
import { initStore, resetStore, addTicket, devices, deviceById, tickets } from "./store.ts";
import { ask } from "./flows/ask.ts";
import { draftProtocol, Protocol } from "./flows/protocol.ts";
import { identify } from "./flows/identify.ts";
import { managerQuery } from "./flows/manager.ts";
import { transcribe } from "./stt.ts";
import { getWeather } from "./sources/weather.ts";
import { RefusalError } from "./claude.ts";
import { passwordGate } from "./auth.ts";

initStore();
const app = new Hono();

passwordGate(app);

app.onError((err, c) => {
  console.error(err);
  const message =
    err instanceof RefusalError ? err.message
    : err instanceof Anthropic.RateLimitError ? "Limit zapytań do modelu — spróbuj za chwilę."
    : err instanceof Anthropic.APIConnectionError ? "Brak połączenia z modelem."
    : err instanceof Anthropic.APIError ? `Błąd modelu (${err.status}).`
    : err.message;
  return c.json({ error: message }, 500);
});

app.get("/api/devices", (c) => c.json(devices));

app.get("/api/devices/:id/tickets", (c) =>
  c.json(tickets.filter((t) => t.deviceId === c.req.param("id")).sort((a, b) => b.openedAt.localeCompare(a.openedAt))),
);

app.get("/api/weather", async (c) => {
  const d = deviceById(c.req.query("deviceId") ?? "");
  const lat = Number(c.req.query("lat") ?? d?.lat);
  const lon = Number(c.req.query("lon") ?? d?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ error: "Brak lokalizacji" }, 400);
  const label = c.req.query("label") ?? d?.location ?? "Twoja lokalizacja";
  return c.json(await getWeather({ lat, lon, label, demo: c.req.query("demo") === "1" }));
});

app.post("/api/stt", async (c) => {
  const body = await c.req.parseBody();
  const file = body.audio;
  if (!(file instanceof File)) return c.json({ error: "Brak pliku audio" }, 400);
  return c.json({ text: await transcribe(file, file.name || "nagranie.webm") });
});

app.post("/api/identify", async (c) => {
  const body = await c.req.parseBody();
  const file = body.image;
  if (!(file instanceof File)) return c.json({ error: "Brak zdjęcia" }, 400);
  const type = file.type as Parameters<typeof identify>[1];
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return c.json({ error: `Nieobsługiwany format ${file.type}` }, 400);
  return c.json(await identify(Buffer.from(await file.arrayBuffer()), type));
});

app.post("/api/ask", async (c) => {
  const { deviceId, question, weather } = await c.req.json<{ deviceId: string; question: string; weather?: { lat?: number; lon?: number; label?: string; demo?: boolean } }>();
  return streamSSE(c, async (stream) => {
    try {
      for await (const event of ask(deviceId, question, weather)) await stream.writeSSE({ data: JSON.stringify(event) });
    } catch (e) {
      console.error(e);
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message: e instanceof Error ? e.message : String(e) }) });
    }
  });
});

app.post("/api/protocol", async (c) => {
  const { deviceId, note, context } = await c.req.json<{ deviceId: string; note: string; context?: string }>();
  return c.json(await draftProtocol(deviceId, note, context));
});

app.post("/api/tickets", async (c) => {
  const { deviceId, note, protocol } = await c.req.json<{ deviceId: string; note: string; protocol: Protocol }>();
  if (!deviceById(deviceId)) return c.json({ error: "Nieznane urządzenie" }, 400);
  const p = Protocol.parse(protocol);
  const now = new Date();
  const ticket = addTicket({
    deviceId,
    openedAt: new Date(now.getTime() - p.repairMinutes * 60000).toISOString(),
    closedAt: now.toISOString(),
    technician: "DEMO",
    category: p.category,
    symptom: p.symptom,
    note,
    cause: p.cause,
    actions: p.actions.join("; "),
    partsUsed: p.partsUsed.map((x) => x.partNo ?? x.name),
    repairMinutes: p.repairMinutes,
    priority: p.priority,
    status: "zamknięte",
    nextServiceAt: p.nextServiceAt ?? undefined,
  });
  return c.json(ticket);
});

app.post("/api/manager", async (c) => {
  const { question } = await c.req.json<{ question: string }>();
  return c.json(await managerQuery(question));
});

app.post("/api/reset", (c) => {
  resetStore();
  return c.json({ ok: true, tickets: tickets.length });
});

// Production: the built client (Vite copies public/ — incl. the PDF manuals — into dist/).
app.use("/*", serveStatic({ root: "./dist" }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`API on http://localhost:${port} · ${tickets.length} zgłoszeń`));
