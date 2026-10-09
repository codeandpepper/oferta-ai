// Retrieval sanity check: do the expected tickets / manual pages land in top-k?
// Run: npm run eval:retrieval
import { initStore, ticketIndex, docIndex, deviceById } from "../src/server/store.ts";
initStore();

const ticketCases: { q: string; type: string; expectCat: string; expectCause?: RegExp }[] = [
  { q: "agregat nie startuje, kontrolka paliwa miga, wczoraj padało", type: "agregat", expectCat: "nie_uruchamia_sie", expectCause: /woda/i },
  { q: "nie odpala po deszczu woda w paliwie", type: "agregat", expectCat: "nie_uruchamia_sie", expectCause: /woda/i },
  { q: "rozrusznik nie kręci", type: "agregat", expectCat: "nie_uruchamia_sie" },
  { q: "napięcie spada pod obciążeniem", type: "agregat", expectCat: "napiecie" },
  { q: "pompa stoi alarm 51", type: "pompa", expectCat: "alarm_51" },
  { q: "pompa hałasuje, szumy", type: "pompa", expectCat: "zapowietrzenie" },
  { q: "błąd przetwornika 88", type: "pompa", expectCat: "alarm_88" },
  { q: "olej cieknie z trafo przy izolatorze", type: "transformator", expectCat: "wyciek_oleju" },
];
const docCases: { q: string; doc: string; page: number }[] = [
  { q: "silnik nie uruchamia się zanieczyszczone paliwo", doc: "fogo-agregaty", page: 22 },
  { q: "alarm 51 pompa zablokowana", doc: "grundfos-magna3", page: 52 },
  { q: "kod 88 błąd przetwornika wewnętrznego", doc: "grundfos-magna3", page: 52 },
  { q: "harmonogram przeglądów wymiana oleju co ile godzin", doc: "fogo-agregaty", page: 20 },
  { q: "tabliczka znamionowa pompy numer seryjny", doc: "grundfos-magna3", page: 18 },
];

let ok = 0, total = 0;
for (const c of ticketCases) {
  const hits = ticketIndex.search(c.q, 10, (t) => deviceById(t.deviceId)?.type === c.type);
  const good = hits.filter((h) => h.item.category === c.expectCat && (!c.expectCause || c.expectCause.test(h.item.cause))).length;
  const need = Math.min(3, hits.length); total++; if (good >= need) ok++;
  console.log(`${good >= need ? "OK  " : "FAIL"} tickets  ${good}/10  ${c.q}`);
}
for (const c of docCases) {
  const hits = docIndex.search(c.q, 5, (ch) => ch.docId === c.doc);
  const rank = hits.findIndex((h) => h.item.page === c.page);
  total++; if (rank >= 0) ok++;
  console.log(`${rank >= 0 ? "OK  " : "FAIL"} docs     rank ${rank >= 0 ? rank + 1 : "-"}  ${c.q}  [${hits.map((h) => h.item.page).join(",")}]`);
}
console.log(`\n${ok}/${total} passed`);
