// Technician assistant: Claude picks which sources to query (tool use), then composes
// one answer in which every section points at its sources.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { client, base, zodTool, asParam, RefusalError } from "../claude.ts";
import { deviceById, docs, parts, tickets } from "../store.ts";
import { semanticInput, searchTickets } from "../sources/tickets-semantic.ts";
import { statsInput, causeStats, historyInput, deviceHistory } from "../sources/tickets-query.ts";
import { docsInput, searchDocs } from "../sources/docs-rag.ts";
import { partsInput, searchParts } from "../sources/parts.ts";
import { getWeather, type WeatherQuery } from "../sources/weather.ts";
import type { Ticket } from "../types.ts";

export type RefKind = "zgloszenie" | "dokumentacja" | "czesc" | "pogoda";
export interface Ref {
  kind: RefKind;
  id: string;
  label: string;
  url?: string;
  detail: string;
  isNew?: boolean;
}

export const Answer = z.strictObject({
  summary: z.string().describe("1–2 zdania: najbardziej prawdopodobna przyczyna i co zrobić najpierw"),
  sections: z.array(
    z.strictObject({
      kind: z.enum(["pogoda", "historia_typ", "historia_egzemplarz", "dokumentacja", "czesci"]),
      title: z.string(),
      text: z.string().describe("2–4 zdania, konkretne liczby i fakty z wyników narzędzi"),
      refs: z.array(z.string()).describe("ID źródeł z wyników narzędzi: numery zgłoszeń ZS-…, chunkId dokumentacji, partNo części"),
    }),
  ),
  steps: z.array(z.string()).describe("zalecane kroki dla technika, w kolejności"),
});
export type Answer = z.infer<typeof Answer>;

const SYSTEM = `Jesteś asystentem technika serwisu urządzeń infrastruktury technicznej.
Technik jest w terenie, przy konkretnym urządzeniu. Odpowiadasz po polsku, krótko i konkretnie.

Masz kilka źródeł wiedzy (narzędzia). Najważniejsza jest historia zgłoszeń serwisowych — to wiedza z praktyki, której nie ma w instrukcjach.
Zwykle użyj wszystkich źródeł, wywołując niezależne narzędzia równolegle:
1. search_ticket_history — podobne przypadki dla tego typu urządzenia (notatki techników są pisane skrótami, z literówkami; w zapytaniu dodaj synonimy i skróty).
2. ticket_cause_stats — gdy znajdziesz kategorię pasującą do problemu, policz przyczyny i średni czas naprawy.
3. device_history — historia tego konkretnego egzemplarza (ostatnie wizyty, uwagi techników, zalecenia).
4. search_documentation — procedura / tabela usterek z dokumentacji producenta (jeśli urządzenie ma docId).
5. search_parts — części i zamienniki, jeśli z historii lub dokumentacji wynika, że będą potrzebne.
6. get_weather — pogoda z ostatnich 7 dni w miejscu urządzenia (opady, temperatury, wilgotność, porywy wiatru). Wywołaj zawsze.

Pogodę przedstaw jako pierwszą sekcję (kind "pogoda", refs ["pogoda-7d"]) i powiąż ją z problemem: czy warunki (opady, wilgoć, mróz, upał, wiatr) wzmacniają lub osłabiają hipotezy z historii zgłoszeń. Jeśli warunki nie pasują do relacji technika (np. nie padało), powiedz to wprost i uwzględnij w diagnozie.

Zasady:
- Opieraj się wyłącznie na wynikach narzędzi. Każda sekcja musi wskazywać ID źródeł w refs.
- Podawaj liczby z historii (ile podobnych zgłoszeń, ile z daną przyczyną, średni czas naprawy).
- Jeśli w wynikach jest zgłoszenie z polem isNew=true (dodane przed chwilą), wyraźnie je uwzględnij i nazwij „najnowsze zgłoszenie”. Nie wspominaj o polu isNew, gdy go nie ma.
- Gdy dokumentacja nie zawiera czegoś wprost, napisz, co zawiera najbliższego, zamiast stwierdzać, że czegoś nie ma.
- Nie wymyślaj numerów stron ani części.`;

const TOOLS = {
  search_ticket_history: {
    label: "Historia zgłoszeń — podobne przypadki",
    tool: zodTool("search_ticket_history", "Wyszukiwanie w opisach i notatkach techników ze zgłoszeń serwisowych dla danego typu urządzenia.", semanticInput),
    run: (i: z.infer<typeof semanticInput>) => searchTickets(i),
  },
  ticket_cause_stats: {
    label: "Historia zgłoszeń — statystyka przyczyn",
    tool: zodTool("ticket_cause_stats", "Zapytanie strukturalne: liczba zgłoszeń danej kategorii dla typu urządzenia, rozbicie na przyczyny i średni czas naprawy.", statsInput),
    run: (i: z.infer<typeof statsInput>) => causeStats(i),
  },
  device_history: {
    label: "Historia egzemplarza",
    tool: zodTool("device_history", "Zapytanie strukturalne: ostatnie zgłoszenia konkretnego egzemplarza urządzenia (najnowsze pierwsze).", historyInput),
    run: (i: z.infer<typeof historyInput>) => deviceHistory(i),
  },
  search_documentation: {
    label: "Dokumentacja (DTR)",
    tool: zodTool("search_documentation", "Wyszukiwanie w dokumentacji techniczno-ruchowej producenta. Zwraca fragmenty z numerem strony PDF. Przy awariach szukaj też tabeli usterek (np. 'tabela usterek nie uruchamia się').", docsInput),
    run: (i: z.infer<typeof docsInput>) => searchDocs(i),
  },
  search_parts: {
    label: "Katalog części",
    tool: zodTool("search_parts", "Wyszukiwanie części zamiennych i zamienników pasujących do modelu urządzenia.", partsInput),
    run: (i: z.infer<typeof partsInput>) => searchParts(i),
  },
  get_weather: {
    label: "Pogoda — ostatnie 7 dni",
    tool: zodTool("get_weather", "Pogoda dzienna z ostatnich 7 dni w miejscu, w którym jest urządzenie (lokalizacja ustalona przez aplikację).", z.strictObject({})),
    run: (_: unknown, ctx: AskContext) => getWeather(ctx.weather),
  },
} as const;
type AskContext = { weather: WeatherQuery };
type ToolName = keyof typeof TOOLS;

export type AskEvent =
  | { type: "tool"; name: string; label: string; input: unknown; resultCount: number }
  | { type: "answer"; answer: Answer; refs: Record<string, Ref> }
  | { type: "error"; message: string };

const ticketRef = (t: Ticket): Ref => {
  const d = deviceById(t.deviceId);
  return {
    kind: "zgloszenie",
    id: t.id,
    label: `${t.id} · ${t.openedAt.slice(0, 10)} · ${t.deviceId}`,
    detail: `${d?.manufacturer} ${d?.model}, ${d?.client}\nObjaw: ${t.symptom}\nNotatka: ${t.note}\nPrzyczyna: ${t.cause}\nCzas: ${t.repairMinutes} min`,
    isNew: t.isNew,
  };
};

function collectRefs(result: unknown, refs: Record<string, Ref>) {
  const items = Array.isArray(result) ? result : [];
  for (const r of items) {
    if (r && typeof r === "object" && "openedAt" in r) refs[r.id] = ticketRef(r as Ticket);
    if (r && typeof r === "object" && "chunkId" in r) {
      const c = r as ReturnType<typeof searchDocs>[number];
      refs[c.chunkId] = { kind: "dokumentacja", id: c.chunkId, label: `${c.title.split(" — ")[0]} · str. ${c.page}`, url: c.url, detail: c.text.slice(0, 600) };
    }
    if (r && typeof r === "object" && "partNo" in r) {
      const p = r as ReturnType<typeof searchParts>[number];
      refs[p.partNo] = refs[p.id] = { kind: "czesc", id: p.partNo, label: `${p.partNo} — ${p.name}`, detail: `Zamiennik/poprzednik: ${p.replaces || "—"}\nStan: ${p.stock} szt.\n${p.note}` };
    }
  }
  if (result && typeof result === "object" && "summary" in result && "days" in result) {
    const w = result as Awaited<ReturnType<typeof getWeather>>;
    const s = w.summary;
    refs["pogoda-7d"] = {
      kind: "pogoda",
      id: "pogoda-7d",
      label: `Pogoda 7 dni · ${w.label}`,
      detail: `Opady: ${s.precipitationMm} mm (${s.rainyDays} dni z deszczem, ostatnio ${s.lastRain ?? "—"})\nTemp.: ${s.tMin}…${s.tMax} °C, dni z mrozem: ${s.frostDays}\nŚr. wilgotność: ${s.avgHumidity}%, max porywy: ${s.maxGustKmh} km/h\nŹródło: ${w.source}`,
    };
  }
  if (result && typeof result === "object" && "ticketIds" in result) {
    for (const id of (result as { ticketIds: string[] }).ticketIds) {
      const t = tickets.find((x) => x.id === id);
      if (t) refs[id] = ticketRef(t);
    }
  }
}

export async function* ask(deviceId: string, question: string, weather?: Partial<WeatherQuery>): AsyncGenerator<AskEvent> {
  const device = deviceById(deviceId);
  if (!device) {
    yield { type: "error", message: `Nieznane urządzenie ${deviceId}` };
    return;
  }
  const doc = docs.find((d) => d.id === device.docId);
  const ctx: AskContext = {
    weather: {
      lat: weather?.lat ?? device.lat,
      lon: weather?.lon ?? device.lon,
      label: weather?.label ?? device.location,
      demo: weather?.demo ?? false,
    },
  };
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Dzisiaj: ${new Date().toISOString().slice(0, 10)}
Urządzenie: ${JSON.stringify({ ...device, docTitle: doc?.title ?? null })}

Technik mówi: „${question}”`,
    },
  ];
  const refs: Record<string, Ref> = {};

  for (let turn = 0; turn < 6; turn++) {
    const response = await client.beta.messages.parse({
      ...base,
      max_tokens: 16000,
      system: SYSTEM,
      tools: Object.values(TOOLS).map((t) => t.tool),
      output_config: { effort: "medium", format: betaZodOutputFormat(Answer) },
      messages,
    });

    if (response.stop_reason === "refusal") throw new RefusalError("Model odmówił odpowiedzi.");

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: asParam(response.content) });
      const calls = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      const results: BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const def = TOOLS[call.name as ToolName];
        if (!def) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: `Nieznane narzędzie ${call.name}`, is_error: true });
          continue;
        }
        try {
          // strict tools guarantee the input matches the schema
          const result: unknown = await def.run(call.input as never, ctx);
          collectRefs(result, refs);
          const count = Array.isArray(result) ? result.length : (result as { total?: number }).total ?? 1;
          yield { type: "tool", name: call.name, label: def.label, input: call.input, resultCount: count };
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: String(e), is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    if (!response.parsed_output) throw new Error(`Brak odpowiedzi strukturalnej (stop_reason=${response.stop_reason})`);
    // Drop refs Claude cited that we never returned (defensive: never show invented sources).
    const answer = response.parsed_output;
    // Parts named in the text link to the catalogue even if search_parts wasn't called this time.
    const text = answer.sections.map((s) => s.text).join(" ");
    collectRefs(parts.filter((p) => text.includes(p.partNo)), refs);
    // Also link any known source ID the section mentions in its text but forgot to list.
    for (const s of answer.sections) {
      const mentioned = Object.keys(refs).filter((id) => s.text.includes(id));
      s.refs = [...new Set([...s.refs, ...mentioned])].filter((id) => refs[id]);
    }
    yield { type: "answer", answer, refs };
    return;
  }
  throw new Error("Przekroczono limit kroków narzędzi");
}
