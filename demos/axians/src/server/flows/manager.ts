// Service manager persona: natural-language question → query spec (JSON, validated)
// → executed in JS → rows + chart + one-sentence takeaway. Claude never writes SQL/code.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { client, base, RefusalError } from "../claude.ts";
import { devices, deviceTypes, tickets } from "../store.ts";
import { QuerySpec, runQuery } from "../sources/tickets-query.ts";

const Plan = z.strictObject({
  query: QuerySpec,
  chart: z.enum(["bar", "line", "none"]).describe("line dla groupBy=month, bar dla rankingów"),
  title: z.string().describe("tytuł wyniku"),
  valueLabel: z.string().describe("opis wartości, np. 'liczba zgłoszeń', 'śr. czas naprawy [min]'"),
});

export async function managerQuery(question: string) {
  const today = new Date().toISOString().slice(0, 10);
  const categories = [...new Set(tickets.map((t) => t.category))];
  const clients = [...new Set(devices.map((d) => d.client))];
  const plan = await client.beta.messages.parse({
    ...base,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(Plan) },
    system: `Tłumaczysz pytania kierownika serwisu na specyfikację zapytania do bazy zgłoszeń serwisowych.
Pola zgłoszenia: data, urządzenie (typ: ${deviceTypes.join("/")}), klient, kategoria, przyczyna, technik, czas naprawy w minutach.
Metryka repeatFailures = liczba awarii, które wystąpiły ponownie na tym samym urządzeniu w ciągu 45 dni od poprzedniej awarii.
"Ostatni kwartał" = poprzedni pełny kwartał kalendarzowy. "Awarie" = bez przeglądów planowych (excludeInspections=true).`,
    messages: [{ role: "user", content: `Dzisiaj: ${today}\nKategorie: ${categories.join(", ")}\nKlienci: ${clients.join("; ")}\n\nPytanie: „${question}”` }],
  });
  if (plan.stop_reason === "refusal") throw new RefusalError("Model odmówił odpowiedzi.");
  if (!plan.parsed_output) throw new Error("Nie udało się zinterpretować pytania");
  const p = plan.parsed_output;
  const rows = runQuery(p.query);

  const summary = await client.beta.messages.create({
    ...base,
    max_tokens: 2000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: `Pytanie kierownika: „${question}”\nWynik (${p.valueLabel}): ${JSON.stringify(rows)}\n\nNapisz jedno-dwa zdania wniosku po polsku, bez wstępów. Jeśli wynik jest pusty, powiedz to wprost.` }],
  });
  const takeaway = summary.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return { ...p, rows, takeaway };
}
