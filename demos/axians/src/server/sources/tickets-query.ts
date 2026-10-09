// Structured queries over ticket fields (dates, device, client, category, repair time).
// At the client this would be SQL against their ticket database; in the demo the same
// query spec is executed in JS over the in-memory array. Claude never writes code here.
import { z } from "zod";
import { tickets, deviceById, deviceTypes } from "../store.ts";
import type { Ticket } from "../types.ts";

export const QueryFilter = z.strictObject({
  deviceType: z.enum(deviceTypes).nullable(),
  deviceId: z.string().nullable().describe("np. AG-003"),
  client: z.string().nullable().describe("fragment nazwy klienta"),
  category: z.string().nullable().describe("np. nie_uruchamia_sie, alarm_51, przeglad"),
  excludeInspections: z.boolean().describe("true = pomiń przeglądy planowe (category=przeglad)"),
  from: z.string().nullable().describe("data od, YYYY-MM-DD"),
  to: z.string().nullable().describe("data do, YYYY-MM-DD"),
});

export const QuerySpec = z.strictObject({
  filter: QueryFilter,
  groupBy: z.enum(["device", "client", "category", "cause", "month", "deviceType", "technician"]),
  metric: z.enum(["count", "avgRepairMinutes", "sumRepairMinutes", "repeatFailures"]),
  sort: z.enum(["desc", "asc"]),
  limit: z.number().int().min(1).max(50),
});
export type QuerySpec = z.infer<typeof QuerySpec>;

const REPEAT_WINDOW_DAYS = 45;

/** A failure counts as repeat if the same device had another failure in the preceding 45 days. */
function repeatIds(all: Ticket[]): Set<string> {
  const ids = new Set<string>();
  const faults = all.filter((t) => t.category !== "przeglad").sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const last = new Map<string, number>();
  for (const t of faults) {
    const at = Date.parse(t.openedAt);
    const prev = last.get(t.deviceId);
    if (prev !== undefined && at - prev <= REPEAT_WINDOW_DAYS * 86400000) ids.add(t.id);
    last.set(t.deviceId, at);
  }
  return ids;
}

export function filterTickets(f: z.infer<typeof QueryFilter>): Ticket[] {
  return tickets.filter((t) => {
    const d = deviceById(t.deviceId);
    if (!d) return false;
    if (f.deviceType && d.type !== f.deviceType) return false;
    if (f.deviceId && t.deviceId !== f.deviceId) return false;
    if (f.client && !d.client.toLowerCase().includes(f.client.toLowerCase())) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.excludeInspections && t.category === "przeglad") return false;
    if (f.from && t.openedAt.slice(0, 10) < f.from) return false;
    if (f.to && t.openedAt.slice(0, 10) > f.to) return false;
    return true;
  });
}

export function runQuery(spec: QuerySpec): { label: string; value: number; tickets: number }[] {
  const rows = filterTickets(spec.filter);
  const repeats = spec.metric === "repeatFailures" ? repeatIds(tickets) : null;
  const keyOf = (t: Ticket): string => {
    const d = deviceById(t.deviceId)!;
    switch (spec.groupBy) {
      case "device": return `${d.id} ${d.manufacturer} ${d.model} (${d.client})`;
      case "client": return d.client;
      case "category": return t.category;
      case "cause": return t.cause;
      case "month": return t.openedAt.slice(0, 7);
      case "deviceType": return d.type;
      case "technician": return t.technician;
    }
  };
  const groups = new Map<string, Ticket[]>();
  for (const t of rows) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  const out = [...groups].map(([label, ts]) => {
    let value: number;
    switch (spec.metric) {
      case "count": value = ts.length; break;
      case "avgRepairMinutes": value = Math.round(ts.reduce((s, t) => s + t.repairMinutes, 0) / ts.length); break;
      case "sumRepairMinutes": value = ts.reduce((s, t) => s + t.repairMinutes, 0); break;
      case "repeatFailures": value = ts.filter((t) => repeats!.has(t.id)).length; break;
    }
    return { label, value, tickets: ts.length };
  });
  const filtered = spec.metric === "repeatFailures" ? out.filter((r) => r.value > 0) : out;
  filtered.sort((a, b) => (spec.sort === "desc" ? b.value - a.value : a.value - b.value) || a.label.localeCompare(b.label));
  if (spec.groupBy === "month") filtered.sort((a, b) => a.label.localeCompare(b.label));
  return filtered.slice(0, spec.limit);
}

// --- tool for the technician assistant: cause breakdown for a category -------------
export const statsInput = z.strictObject({
  deviceType: z.enum(deviceTypes),
  category: z.string().describe("kategoria zgłoszeń, np. nie_uruchamia_sie — weź ją z wyników search_ticket_history"),
});

export function causeStats(input: z.infer<typeof statsInput>) {
  const rows = filterTickets({ deviceType: input.deviceType, deviceId: null, client: null, category: input.category, excludeInspections: false, from: null, to: null });
  const byCause = runQuery({
    filter: { deviceType: input.deviceType, deviceId: null, client: null, category: input.category, excludeInspections: false, from: null, to: null },
    groupBy: "cause", metric: "count", sort: "desc", limit: 10,
  });
  const avg = rows.length ? Math.round(rows.reduce((s, t) => s + t.repairMinutes, 0) / rows.length) : 0;
  return {
    total: rows.length,
    avgRepairMinutes: avg,
    byCause: byCause.map((r) => ({
      cause: r.label,
      count: r.value,
      avgRepairMinutes: Math.round(rows.filter((t) => t.cause === r.label).reduce((s, t) => s + t.repairMinutes, 0) / r.value),
    })),
    ticketIds: rows.map((t) => t.id),
  };
}

// --- tool: full history of one device (structured filter by deviceId) --------------
export const historyInput = z.strictObject({
  deviceId: z.string().describe("ID urządzenia, np. AG-003"),
});

export function deviceHistory(input: z.infer<typeof historyInput>) {
  return tickets
    .filter((t) => t.deviceId === input.deviceId)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, 12);
}
