// Nameplate photo → manufacturer / model / all printed numbers / parameters → matching device.
// Works on real field photos: rotated, poorly lit, worn, in a foreign language.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { client, base, RefusalError } from "../claude.ts";
import { devices } from "../store.ts";
import type { Device } from "../types.ts";

const Plate = z.strictObject({
  manufacturer: z.string().nullable(),
  model: z.string().nullable().describe("oznaczenie typu/modelu dokładnie jak na tabliczce"),
  deviceKind: z.string().nullable().describe("rodzaj urządzenia po polsku, np. „agregat prądotwórczy”"),
  serial: z.string().nullable().describe("numer seryjny / fabryczny, jeśli da się wskazać"),
  identifiers: z
    .array(z.strictObject({ label: z.string().describe("etykieta z tabliczki (oryginalna)"), value: z.string() }))
    .describe("WSZYSTKIE numery z tabliczki: nr seryjny, fabryczny, katalogowy/zamówieniowy, nr prądnicy itd."),
  parameters: z
    .array(z.strictObject({ label: z.string().describe("nazwa parametru po polsku"), value: z.string().describe("wartość z jednostką") }))
    .describe("parametry techniczne: napięcie, prąd, moc, cos φ, obroty, częstotliwość, stopień ochrony, klasa izolacji, norma…"),
  photoConditions: z.string().describe("krótko po polsku: jak wygląda zdjęcie (np. obrócone o ok. 60°, słabe oświetlenie, zabrudzenia) i czy odczyt jest pewny"),
  uncertain: z.array(z.string()).describe("pola odczytane z niepewnością"),
});

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function match(plate: z.infer<typeof Plate>): { device: Device | null; matchedBy: "serial" | "model" | null } {
  const read = new Set([plate.serial, ...plate.identifiers.map((i) => i.value)].map(norm).filter((v) => v.length >= 4));
  const ids = (d: Device) => [d.serial, ...(d.altIds ?? [])].map(norm);
  const bySerial = devices.find((d) => ids(d).some((id) => [...read].some((r) => r === id || r.includes(id) || id.includes(r))));
  if (bySerial) return { device: bySerial, matchedBy: "serial" };
  const model = norm(plate.model);
  const byModel = model ? devices.find((d) => norm(d.model).includes(model) || model.includes(norm(d.model))) : undefined;
  return { device: byModel ?? null, matchedBy: byModel ? "model" : null };
}

export async function identify(image: Buffer, mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif") {
  const response = await client.beta.messages.parse({
    ...base,
    max_tokens: 8000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Plate) },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
        {
          type: "text",
          text: `To zdjęcie tabliczki znamionowej urządzenia, zrobione w terenie — może być obrócone, ciemne, zabrudzone lub w obcym języku.
Odczytaj wszystkie dane dokładnie tak, jak są wybite/nadrukowane (nie poprawiaj numerów). Nazwy parametrów przetłumacz na polski.`,
        },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new RefusalError("Model odmówił odpowiedzi.");
  const plate = response.parsed_output;
  if (!plate) throw new Error("Nie udało się odczytać tabliczki");
  return { plate, ...match(plate) };
}
