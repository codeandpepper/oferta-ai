// In-memory data store backed by JSON seed files. No database on purpose:
// Heroku's filesystem is ephemeral anyway, and the demo resets from seed.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LexicalIndex } from "./search.ts";
import type { Device, Doc, DocChunk, Part, Ticket } from "./types.ts";

const SEED = new URL("../../data/seed/", import.meta.url);
const RUNTIME_FILE = join(tmpdir(), "axians-demo-tickets.runtime.json");

const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, SEED), "utf8"));

export const devices: Device[] = load("devices.json");
export const deviceTypes = [...new Set(devices.map((d) => d.type))] as [string, ...string[]];
export const parts: Part[] = load("parts.json");
export const docs: Doc[] = load("docs.json");
export const docChunks: DocChunk[] = load("doc_chunks.json");

let seedTickets: Ticket[] = load("tickets.json");
export let tickets: Ticket[] = [];

const ticketText = (t: Ticket) => `${t.symptom}. ${t.note}. ${t.cause}. ${t.actions}`;
export const ticketIndex = new LexicalIndex<Ticket>([], ticketText);
const pageHint = (c: DocChunk) => docs.find((d) => d.id === c.docId)?.pageHints?.[String(c.page)] ?? "";
export const docIndex = new LexicalIndex<DocChunk>(docChunks, (c) => `${pageHint(c)} ${pageHint(c)} ${c.text}`);

function setTickets(list: Ticket[]) {
  tickets = list;
  ticketIndex.rebuild(tickets);
}

export function initStore() {
  const runtime: Ticket[] = existsSync(RUNTIME_FILE) ? JSON.parse(readFileSync(RUNTIME_FILE, "utf8")) : [];
  setTickets([...seedTickets, ...runtime]);
}

export function resetStore() {
  rmSync(RUNTIME_FILE, { force: true });
  setTickets([...seedTickets]);
}

export function addTicket(t: Omit<Ticket, "id">): Ticket {
  const year = t.openedAt.slice(0, 4);
  const ticket: Ticket = { ...t, id: `ZS-${year}-${String(tickets.length + 1).padStart(4, "0")}`, isNew: true };
  setTickets([...tickets, ticket]);
  writeFileSync(RUNTIME_FILE, JSON.stringify(tickets.filter((x) => x.isNew), null, 1));
  return ticket;
}

export const deviceById = (id: string) => devices.find((d) => d.id === id);
