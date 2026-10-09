// Spare parts catalogue — an extra source to show the architecture is open.
import { z } from "zod";
import { parts } from "../store.ts";
import { LexicalIndex } from "../search.ts";

const index = new LexicalIndex(parts, (p) => `${p.name} ${p.note} ${p.replaces} ${p.partNo}`);

export const partsInput = z.strictObject({
  query: z.string().describe("jakich części szukać, np. 'filtr paliwa korek wlewu złącze czujnika'"),
  model: z.string().describe("model urządzenia, np. FV 15540 ER"),
});

export function searchParts(input: z.infer<typeof partsInput>) {
  return index.search(input.query, 6, (p) => p.fits.includes(input.model)).map((h) => h.item);
}
