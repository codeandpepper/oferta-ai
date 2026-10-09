// Free-text search over technicians' notes (the messy part of the ticket history).
import { z } from "zod";
import { ticketIndex, deviceById, deviceTypes } from "../store.ts";

export const semanticInput = z.strictObject({
  query: z.string().describe("opis problemu + synonimy i skróty, jakich używają technicy (np. 'nie odpala nie startuje brak rozruchu woda paliwo')"),
  deviceType: z.enum(deviceTypes),
  excludeInspections: z.boolean().describe("true = pomiń przeglądy planowe"),
});

export function searchTickets(input: z.infer<typeof semanticInput>) {
  return ticketIndex
    .search(input.query, 15, (t) => deviceById(t.deviceId)?.type === input.deviceType && (!input.excludeInspections || t.category !== "przeglad"))
    .map((h) => ({ ...h.item, score: Math.round(h.score * 100) / 100 }));
}
