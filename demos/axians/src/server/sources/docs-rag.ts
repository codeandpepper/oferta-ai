// Manufacturer documentation (DTR) — page-level chunks, cited by document + PDF page.
import { z } from "zod";
import { docIndex, docs } from "../store.ts";

export const docsInput = z.strictObject({
  query: z.string().describe("czego szukać w instrukcji (objaw, kod błędu, czynność serwisowa)"),
  docId: z.string().describe("ID dokumentu przypisanego do urządzenia (pole docId)"),
});

export function searchDocs(input: z.infer<typeof docsInput>) {
  const doc = docs.find((d) => d.id === input.docId);
  if (!doc) return [];
  return docIndex
    .search(input.query, 6, (c) => c.docId === doc.id)
    .map((h) => ({ chunkId: h.item.id, docId: doc.id, title: doc.title, page: h.item.page, pageInfo: doc.pageHints?.[String(h.item.page)] ?? null, url: `${doc.file.replace(/^\//, "")}#page=${h.item.page}`, text: h.item.text }));
}
