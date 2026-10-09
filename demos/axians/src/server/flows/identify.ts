// Nameplate photo → manufacturer / model / serial → matching device from the registry.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { client, base, RefusalError } from "../claude.ts";
import { devices } from "../store.ts";
import type { Device } from "../types.ts";

const Plate = z.strictObject({
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  otherData: z.array(z.string()).describe("inne odczytane parametry, np. moc, napięcie, rok produkcji"),
  readable: z.boolean().describe("czy tabliczka była czytelna"),
});

const norm = (s: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function identify(image: Buffer, mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif") {
  const response = await client.beta.messages.parse({
    ...base,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(Plate) },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
        { type: "text", text: "To zdjęcie tabliczki znamionowej urządzenia. Odczytaj producenta, model i numer seryjny dokładnie tak, jak są napisane." },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new RefusalError("Model odmówił odpowiedzi.");
  const plate = response.parsed_output;
  if (!plate) throw new Error("Nie udało się odczytać tabliczki");
  let match: Device | undefined = devices.find((d) => plate.serial && norm(d.serial) === norm(plate.serial));
  let matchedBy: "serial" | "model" | null = match ? "serial" : null;
  if (!match) {
    match = devices.find((d) => plate.model && norm(plate.model).includes(norm(d.model)));
    if (match) matchedBy = "model";
  }
  return { plate, device: match ?? null, matchedBy };
}
