// Dictated, chaotic closing note → structured service protocol (SAP FSM/EAM-like work order).
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { client, base, RefusalError } from "../claude.ts";
import { deviceById, parts, tickets } from "../store.ts";

export const Protocol = z.strictObject({
  symptom: z.string().describe("zgłoszony objaw, jedno zdanie"),
  category: z.string().describe("kategoria — użyj jednej z istniejących, jeśli pasuje"),
  cause: z.string().describe("ustalona przyczyna, jedno zdanie"),
  actions: z.array(z.string()).describe("wykonane czynności, w kolejności"),
  partsUsed: z.array(z.strictObject({ partNo: z.string().nullable(), name: z.string(), qty: z.number() })),
  repairMinutes: z.number().int().describe("czas pracy w minutach; jeśli technik podał godziny, przelicz"),
  priority: z.enum(["niski", "normalny", "wysoki", "krytyczny"]),
  recommendations: z.array(z.string()).describe("zalecenia na przyszłość"),
  nextServiceAt: z.string().nullable().describe("termin kolejnego przeglądu YYYY-MM-DD, jeśli wynika z notatki lub standardu"),
  missing: z.array(z.string()).describe("czego brakuje w notatce, o co warto dopytać technika"),
});
export type Protocol = z.infer<typeof Protocol>;

export async function draftProtocol(deviceId: string, note: string, context?: string): Promise<Protocol> {
  const device = deviceById(deviceId);
  if (!device) throw new Error(`Nieznane urządzenie ${deviceId}`);
  const categories = [...new Set(tickets.map((t) => t.category))];
  const catalog = parts.filter((p) => p.fits.includes(device.model)).map((p) => `${p.partNo} ${p.name}`);
  const response = await client.beta.messages.parse({
    ...base,
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(Protocol) },
    system: "Zamieniasz podyktowaną, chaotyczną notatkę technika serwisu na ustrukturyzowany protokół zlecenia. Po polsku. Nie dopisuj czynności, których technik nie wymienił; braki wpisz w missing. Części dopasuj do katalogu, jeśli to możliwe.",
    messages: [{
      role: "user",
      content: `Dzisiaj: ${new Date().toISOString().slice(0, 10)}
Urządzenie: ${JSON.stringify(device)}
Istniejące kategorie: ${categories.join(", ")}
Katalog części dla modelu: ${catalog.join("; ")}
${context ? `Kontekst diagnozy z asystenta: ${context}\n` : ""}
Notatka technika: „${note}”`,
    }],
  });
  if (response.stop_reason === "refusal") throw new RefusalError("Model odmówił odpowiedzi.");
  if (!response.parsed_output) throw new Error("Brak protokołu");
  return response.parsed_output;
}
