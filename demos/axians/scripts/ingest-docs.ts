// PDF manuals → page-level chunks (with PDF page numbers for #page=N links).
// Run: npm run seed:docs  → data/seed/doc_chunks.json
import { readFileSync, writeFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import type { DocChunk } from "../src/server/types.ts";

const docs: { id: string; file: string; pages: [number, number] }[] = JSON.parse(readFileSync("data/seed/docs.json", "utf8"));
const MAX = 1400; // chars per chunk; long pages are split on sentence boundaries

const chunks: DocChunk[] = [];
for (const doc of docs) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync("public" + doc.file)));
  const { text } = await extractText(pdf, { mergePages: false });
  for (let p = doc.pages[0]; p <= doc.pages[1]; p++) {
    // unpdf letter-spaces some headings ("H a r m o n o g r a m") — glue single letters back
    const clean = text[p - 1]
      .replace(/\s+/g, " ")
      .replace(/(?:\b\p{L} ){3,}\p{L}\b/gu, (m) => m.replace(/ /g, ""))
      .trim();
    if (clean.length < 80) continue;
    let rest = clean;
    let part = 0;
    while (rest.length) {
      let cut = rest.length <= MAX ? rest.length : rest.lastIndexOf(". ", MAX) + 1 || MAX;
      chunks.push({ id: `${doc.id}-p${p}-${part++}`, docId: doc.id, page: p, text: rest.slice(0, cut).trim() });
      rest = rest.slice(cut).trim();
    }
  }
}
writeFileSync("data/seed/doc_chunks.json", JSON.stringify(chunks, null, 1));
console.log(`chunks: ${chunks.length}`);
