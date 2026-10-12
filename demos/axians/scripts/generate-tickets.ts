// Deterministic generator of synthetic service tickets (no API key needed).
// Patterns the demo relies on are pinned explicitly; the rest is seeded noise.
// Run: npm run seed:tickets  → data/seed/tickets.json
import { readFileSync, writeFileSync } from "node:fs";
import type { Device, Ticket } from "../src/server/types.ts";

const devices: Device[] = JSON.parse(readFileSync("data/seed/devices.json", "utf8"));

// --- seeded RNG -------------------------------------------------------------
let seed = 20261009;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));

// --- messiness: technicians don't write clean Polish ------------------------
const PL: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
function mess(text: string): string {
  let t = text;
  if (rnd() < 0.45) t = t.replace(/[ąćęłńóśźż]/g, (c) => PL[c]);
  const typos = rnd() < 0.5 ? between(1, 2) : 0;
  for (let i = 0; i < typos; i++) {
    const words = t.split(" ");
    const idx = Math.floor(rnd() * words.length);
    const w = words[idx];
    if (w.length > 4) {
      const p = between(1, w.length - 3);
      words[idx] = w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2);
    }
    t = words.join(" ");
  }
  if (rnd() < 0.3) t = t.replace(/\.\s*$/, "");
  return t;
}

// --- categories -------------------------------------------------------------
interface Cat {
  category: string;
  symptom: string[];
  cause: string;
  actions: string;
  parts: string[];
  minutes: [number, number];
  priority: Ticket["priority"];
  notes: string[];
}

const startWater: Cat = {
  category: "nie_uruchamia_sie",
  symptom: ["Agregat nie uruchamia się, rozrusznik kręci", "Brak rozruchu po opadach", "Agregat nie startuje przy teście tygodniowym, miga kontrolka paliwa"],
  cause: "Woda w paliwie (nieszczelny korek wlewu / kondensacja w zbiorniku)",
  actions: "Spuszczenie osadu z odstojnika, wymiana paliwa, wymiana filtra paliwa, wymiana korka wlewu",
  parts: ["FG-FP-15540", "FG-KW-01"],
  minutes: [70, 120],
  priority: "wysoki",
  notes: [
    "po deszczach nie odpala, rozrusznik kreci ok. w odstojniku woda!! spuszczono, wym. filtra pal. + nowe paliwo. korek wlewu nieszczelny - wym. na nowy z uszczelka. odpalil, test 20 min ok.",
    "nie startuje, miga kontr. paliwa mimo pelnego zbiornika. woda w paliwie, osad w filtrze. wym filtr, paliwo, korek. ok",
    "brak rozruchu. paliwo metne, woda na dnie zbiornika (ok 0,5l). spuszczono, wym. filtra paliwa FG-FP. klient - agregat stoi pod golym niebem, zalecam daszek",
    "Agr. nie odpalil na teście. Woda w ukł. paliwowym po ulewach. Wym. filtr pal., paliwo, uszczelka korka. Po naprawie OK.",
    "nie pali. sprawdzono swiece - ok, aku - 12,6V ok. w filtrze paliwa woda. wymiana filtra + osuszenie zbiornika, nowy korek wlewu (stary pekniety). dziala",
    "zgłoszenie: nie startuje po weekendzie (padało). przyczyna woda w paliwie. wym. filtra, paliwa. korek ok. 1,5h",
    "rozrusznik kreci, silnik nie łapie. woda w odstojniku + rdza na dnie zbiornika. czyszczenie, wym. filtra pal., nowe paliwo. zalecam kontrole co miesiac po opadach",
    "nie uruchamia sie. kontrolka paliwa miga. woda w paliwie, złacze czujnika poz. paliwa zawilgocone - osuszono, zabezp. smarem. wym filtr pal. ok",
  ],
};
const startBattery: Cat = {
  category: "nie_uruchamia_sie",
  symptom: ["Agregat nie uruchamia się, rozrusznik nie kręci"],
  cause: "Rozładowany / zasiarczony akumulator rozruchowy",
  actions: "Pomiar akumulatora, wymiana akumulatora, kontrola ładowania",
  parts: ["FG-AK-12V24"],
  minutes: [40, 70],
  priority: "wysoki",
  notes: [
    "nie kreci rozrusznik, aku 10,9V pod obc. siada. wym. aku na nowy 24Ah. ladowanie ok 13,8V. ok",
    "brak rozruchu - aku do wymiany (zasiarczony, 5 lat). wymieniono. test ok",
  ],
};
const startPlug: Cat = {
  category: "nie_uruchamia_sie",
  symptom: ["Agregat nie uruchamia się, rozrusznik kręci"],
  cause: "Zawilgocona / zanieczyszczona świeca zapłonowa",
  actions: "Wymiana świecy zapłonowej, osuszenie fajki",
  parts: ["FG-SW-BPR6"],
  minutes: [30, 60],
  priority: "normalny",
  notes: [
    "nie odpala, iskra slaba. swieca zaolejona i wilgotna fajka. wym. swiecy, osuszono. ok",
    "brak rozruchu, rozrusznik kreci. swieca do wym (nagar). wymieniono, paliwo sprawdzone - bez wody. ok",
  ],
};

const catsByType: Record<Device["type"], { cat: Cat; w: number }[]> = {
  agregat: [
    { w: 5, cat: { category: "przeglad", symptom: ["Przegląd okresowy"], cause: "Przegląd planowy", actions: "Wymiana oleju, filtra powietrza, kontrola świecy, test pod obciążeniem", parts: ["OL-10W30-1L", "FG-FPW-15540"], minutes: [60, 100], priority: "niski",
      notes: ["przeglad roczny. wym oleju 1,1l, filtr powietrza, swieca ok. test pod obc 30min ok", "przegl. kwartalny - test rozruchu, poziom oleju ok, napiecia w normie", "PO przegląd. olej wym., f. powietrza wym. aku 12,7V. ok", "przeglad - wym oleju, swieca wym. lekki wyciek przy korku spustowym - dokrecono", "kontrola kwartalna: rozruch ok, aku 12,8V, paliwo 3/4, brak wyciekow", "test pod obc. 15 min, U=230V f=50Hz ok. olej ok", "przegl. - filtr pow. przedmuchany, swieca ok, paliwo uzupelnione", "przeglad kwart. agregat czysty, rozruch za 1 razem. ok"] } },
    { w: 1.2, cat: { category: "napiecie", symptom: ["Za niskie napięcie pod obciążeniem", "Wahania napięcia na wyjściu"], cause: "Uszkodzony regulator AVR", actions: "Pomiar napięć, wymiana AVR", parts: ["FG-AVR-3F"], minutes: [60, 150], priority: "wysoki",
      notes: ["napiecie spada do 190V przy obc. AVR do wym. wymieniono, pomiar ok 229/231/230", "wahania napiecia, AVR uszkodzony. wym. AVR. ok", "niskie U pod obc. - luzny styk na pradnicy dokrecono + AVR wym."] } },
    { w: 0.8, cat: { category: "drgania", symptom: ["Duże drgania i hałas podczas pracy"], cause: "Zużyte amortyzatory / luźne połączenia śrubowe", actions: "Dokręcenie połączeń, wymiana amortyzatorów", parts: [], minutes: [40, 90], priority: "normalny",
      notes: ["drgania - amortyzatory silnika zuzyte, wym. 2szt + dokrecono ramę", "glosna praca, luzne sruby mocowania pradnicy - dokrecono. ok"] } },
    { w: 0.8, cat: { category: "olej", symptom: ["Silnik gaśnie po kilku minutach pracy"], cause: "Zbyt niski poziom oleju — zadziałanie czujnika oleju", actions: "Uzupełnienie oleju, kontrola wycieków", parts: ["OL-10W30-1L"], minutes: [20, 50], priority: "normalny",
      notes: ["gasnie po 3 min. olej ponizej min. uzupelniono 0,6l, wyciekow brak. ok", "czujnik oleju wylacza silnik - niski poziom. dolano. zalecam kontrole co tydz."] } },
  ],
  pompa: [
    { w: 1.2, cat: { category: "alarm_51", symptom: ["Pompa zatrzymana, alarm 51 „Pompa zablokowana”"], cause: "Zablokowany wirnik — osady / magnetyt w instalacji", actions: "Demontaż głowicy, czyszczenie wirnika, płukanie", parts: ["GF-UST-MAGNA3"], minutes: [90, 180], priority: "krytyczny",
      notes: ["alarm 51 pompa zablok. zdjeta glowica, wirnik oblepiony szlamem (magnetyt). wyczyszczono, nowe uszczelki. ruszyła", "A51 - zablokowana. osady w korpusie. czyszczenie + plukanie obiegu. zalecam separator z magnesem!!", "pompa stoi, kod 51. czyszczenie wirnika, nowe usz. ok. instalacja brudna"] } },
    { w: 0.8, cat: { category: "alarm_88", symptom: ["Ostrzeżenie 88 „Błąd przetwornika wewnętrznego”"], cause: "Poluzowana wtyczka / uszkodzony przetwornik różnicy ciśnienia", actions: "Kontrola wtyczki przetwornika, wymiana przetwornika", parts: ["GF-99280455"], minutes: [30, 90], priority: "normalny",
      notes: ["ostrz. 88. wtyczka przetwornika poluzowana - wpieta, skasowano. ok", "kod 88 wraca. przetwornik wymieniony na nowy. ok", "88 - przetwornik zablokowany osadem, wyczyszczono"] } },
    { w: 1, cat: { category: "zapowietrzenie", symptom: ["Pompa głośno pracuje, szumy w instalacji"], cause: "Zapowietrzenie instalacji / niskie ciśnienie", actions: "Odpowietrzenie, uzupełnienie ciśnienia instalacji", parts: [], minutes: [20, 60], priority: "niski",
      notes: ["szumi, zapowietrzona. odpowietrzono, cisn. uzup. do 1,8 bar. cicho", "halas - powietrze w ukl. odpowietrzono. ok"] } },
    { w: 0.5, cat: { category: "alarm_40", symptom: ["Alarm 40 „Za niskie napięcie”"], cause: "Zaniki / spadki napięcia zasilania", actions: "Pomiar zasilania, kontrola zabezpieczeń", parts: [], minutes: [30, 60], priority: "wysoki",
      notes: ["alarm 40, napiecie 198V. problem po stronie zasilania budynku - zgloszono admin.", "A40 - luzny zacisk w skrzynce zasilania. dokrecono. ok"] } },
    { w: 3, cat: { category: "przeglad", symptom: ["Przegląd okresowy"], cause: "Przegląd planowy", actions: "Kontrola pracy, odczyt alarmów, kontrola szczelności", parts: [], minutes: [20, 45], priority: "niski",
      notes: ["przeglad - pompa ok, brak alarmow w logu. tryb AUTOADAPT", "przegl. ok. drobny wyciek na kolnierzu - dokrecono", "przeglad okresowy, log alarmow czysty, ok", "przeglad polroczny, w logu 1x ostrz. 88 sprzed 2 mies, teraz ok", "kontrola pracy pompy, cisn. instalacji 1,6 bar ok, brak szumow"] } },
  ],
  transformator: [
    { w: 1, cat: { category: "wyciek_oleju", symptom: ["Wyciek oleju z kadzi"], cause: "Nieszczelna uszczelka izolatora przepustowego nN", actions: "Wymiana uszczelki, uzupełnienie oleju", parts: ["TR-USZ-IZ", "TR-OL-NYN"], minutes: [120, 240], priority: "wysoki",
      notes: ["wyciek przy izolatorze nN faza L2. wym. uszczelki, dolano oleju 4l. obserwowac", "pocenie oleju na kadzi przy przepustach. wym usz. ok"] } },
    { w: 1, cat: { category: "osuszacz", symptom: ["Zmiana barwy osuszacza"], cause: "Zawilgocony silikażel w odwilżaczu", actions: "Wymiana wkładu osuszacza", parts: ["TR-SIL-1KG"], minutes: [20, 40], priority: "niski",
      notes: ["silikazel zmienil kolor w 3/4. wymieniono wklad", "osuszacz do wym - wymieniony"] } },
    { w: 0.6, cat: { category: "temperatura", symptom: ["Wysoka temperatura oleju (wskazanie termometru)"], cause: "Przeciążenie w okresie letnim", actions: "Pomiar obciążenia, zalecenie rozdziału obciążeń", parts: [], minutes: [60, 120], priority: "wysoki",
      notes: ["temp oleju 88st. obciazenie 105%. klimatyzacja hali. zalecono rozdzial obciazen", "wysoka temp - przeciazenie latem. pomiary, raport dla klienta"] } },
    { w: 2, cat: { category: "przeglad", symptom: ["Przegląd okresowy"], cause: "Przegląd planowy", actions: "Oględziny, pomiar rezystancji izolacji, kontrola poziomu oleju", parts: [], minutes: [90, 180], priority: "niski",
      notes: ["przeglad. Riz ok, olej w normie, izolatory czyste", "przegl. okresowy + pomiary. brud na izolatorach - wyczyszczono", "przeglad ok, osuszacz 1/3 - jeszcze ok"] } },
  ],
};

const techs = ["JK", "MW", "PZ", "TB", "AS"];
const START = Date.parse("2023-10-01");
const END = Date.parse("2026-10-03");
const day = 86400000;

const tickets: Ticket[] = [];
function add(device: Device, cat: Cat, opened: Date, noteIdx?: number, override: Partial<Ticket> = {}) {
  const minutes = between(...cat.minutes);
  const closed = new Date(opened.getTime() + between(2, 30) * 3600000);
  const note = noteIdx !== undefined ? cat.notes[noteIdx] : pick(cat.notes);
  tickets.push({
    id: "",
    deviceId: device.id,
    openedAt: opened.toISOString(),
    closedAt: closed.toISOString(),
    technician: pick(techs),
    category: cat.category,
    symptom: pick(cat.symptom),
    note: mess(note),
    cause: cat.cause,
    actions: cat.actions,
    partsUsed: cat.parts,
    repairMinutes: minutes,
    priority: cat.priority,
    status: "zamknięte",
    ...override,
  });
}
const dev = (id: string) => devices.find((d) => d.id === id)!;
const at = (iso: string) => new Date(iso + "T" + String(between(7, 14)).padStart(2, "0") + ":" + String(between(0, 59)).padStart(2, "0") + ":00Z");

// --- pinned patterns ----------------------------------------------------------
// 1) 12 "nie uruchamia się" tickets for generators: 8 water in fuel, 2 battery, 2 spark plug.
const waterDates: [string, string][] = [
  ["AG-003", "2024-11-20"], ["AG-001", "2024-04-09"], ["AG-002", "2024-10-03"], ["AG-005", "2025-01-15"],
  ["AG-002", "2025-05-27"], ["AG-004", "2025-09-18"], ["AG-006", "2026-02-11"], ["AG-001", "2026-06-24"],
];
waterDates.forEach(([id, d], i) => add(dev(id), startWater, at(d), i, i === 0 ? { repairMinutes: 95 } : {}));
add(dev("AG-004"), startBattery, at("2024-01-22"), 0);
add(dev("AG-006"), startBattery, at("2025-12-08"), 1);
add(dev("AG-003"), startPlug, at("2025-10-28"), 0);
add(dev("AG-005"), startPlug, at("2023-12-14"), 1);

// 2) Demo device AG-003: latest visit in March 2026 noted corrosion on the fuel level sensor connector.
const ag3Service = catsByType.agregat[0].cat;
add(dev("AG-003"), { ...ag3Service, actions: "Wymiana oleju, filtra powietrza i filtra paliwa; zabezpieczenie złącza czujnika poziomu paliwa", parts: ["OL-10W30-1L", "FG-FPW-15540", "FG-FP-15540"] }, at("2026-03-12"), 0, {
  note: "przeglad roczny. wym. oleju, filtra pow. i filtra paliwa (w filtrze troche osadu). slady korozji na zlaczu czujnika poz. paliwa - oczyszczono, zabezp. smarem kontaktowym. ZALECAM wym. kostki na uszczelniona FG-ZL-CZP przy nast. wizycie. reszta ok",
  technician: "MW",
  repairMinutes: 110,
  nextServiceAt: "2027-03-12",
});

// 2b) AG-007: old Bosch BWKA 3 (1987) — wear-related history, recommendation to replace.
const boschVolt = { ...catsByType.agregat[1].cat, cause: "Zużyte szczotki / pierścienie ślizgowe prądnicy", actions: "Wymiana szczotek, czyszczenie pierścieni ślizgowych", parts: [] };
add(dev("AG-007"), boschVolt, at("2024-09-17"), 0, { note: "stary bosch, napiecie skacze 200-240V. szczotki pradnicy starte do konca, pierscienie brudne. wym. szczotek (zamiennik, oryginalow brak), czyszczenie. ok", repairMinutes: 150 });
add(dev("AG-007"), { ...catsByType.agregat[3].cat }, at("2025-06-03"), 0, { note: "gasnie po kilku min. olej ponizej min, wyciek spod uszczelki miski olejowej. dolano 0,8l, uszczelka do wym - czesc na zamowienie (model z 1987)", repairMinutes: 60 });
add(dev("AG-007"), { ...catsByType.agregat[0].cat }, at("2026-04-22"), 0, { note: "przeglad. agregat z 1987r, korozja obudowy i ramy, wyciek oleju dalej (uszczelka miski nadal nie dostepna). izolacja przewodow parciejaca. ZALECAM modernizacje lub wymiane agregatu na nowy - koszty napraw rosna, czesci brak", repairMinutes: 120 });

// 3) Repeat failures in the last quarter (2026-07..09): pumps at Centrum Logistyczne Zalesie, generator AG-004.
const a51 = catsByType.pompa[0].cat;
add(dev("PO-004"), a51, at("2026-07-08"), 0);
add(dev("PO-004"), a51, at("2026-08-12"), 2);
add(dev("PO-004"), a51, at("2026-09-16"), 1);
add(dev("PO-005"), a51, at("2026-07-29"), 2);
add(dev("PO-005"), a51, at("2026-09-02"), 0);
const volt = catsByType.agregat[1].cat;
add(dev("AG-004"), volt, at("2026-07-21"), 1);
add(dev("AG-004"), volt, at("2026-08-25"), 2);
add(dev("TR-001"), catsByType.transformator[2].cat, at("2026-07-14"), 0);
add(dev("TR-001"), catsByType.transformator[2].cat, at("2026-08-05"), 1);

// --- background: scheduled inspections + random failures ---------------------------
const inspectEveryDays: Record<Device["type"], number> = { agregat: 91, pompa: 182, transformator: 365 };
const failures: Record<Device["type"], [number, number]> = { agregat: [4, 7], pompa: [3, 6], transformator: [2, 5] };
const extras = ["", "", "", " klient poinformowany.", " brak uwag.", " dojazd 40km.", " protokol podpisany.", " zdjecia w zalaczniku.", " nast. wizyta wg planu."];
for (const d of devices) {
  const cats = catsByType[d.type];
  const service = cats.find((c) => c.cat.category === "przeglad")!.cat;
  // AG-003: inspections stop before its pinned March 2026 visit, which must stay the latest entry.
  const until = d.id === "AG-003" ? Date.parse("2026-01-31") : d.id === "AG-007" ? Date.parse("2026-03-31") : END;
  for (let t = START + between(0, 60) * day; t < until; t += (inspectEveryDays[d.type] + between(-12, 12)) * day) {
    add(d, service, new Date(Math.round(t / day) * day + between(7, 14) * 3600000));
    tickets[tickets.length - 1].note += pick(extras);
  }
  if (d.id === "AG-003" || d.id === "AG-007") continue;
  const faults = cats.filter((c) => c.cat.category !== "przeglad");
  const total = faults.reduce((s, c) => s + c.w, 0);
  for (let i = 0, n = between(...failures[d.type]); i < n; i++) {
    let r = rnd() * total;
    const { cat } = faults.find((c) => (r -= c.w) < 0) ?? faults[0];
    // keep the last quarter for the pinned repeat failures
    const t = START + rnd() * (Date.parse("2026-06-15") - START);
    add(d, cat, new Date(Math.round(t / day) * day + between(7, 14) * 3600000));
    tickets[tickets.length - 1].note += pick(extras);
  }
}

tickets.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
tickets.forEach((t, i) => {
  const y = t.openedAt.slice(0, 4);
  t.id = `ZS-${y}-${String(i + 1).padStart(4, "0")}`;
});

writeFileSync("data/seed/tickets.json", JSON.stringify(tickets, null, 1));
const byCat = tickets.reduce<Record<string, number>>((m, t) => ((m[t.category] = (m[t.category] ?? 0) + 1), m), {});
console.log(`tickets: ${tickets.length}`, byCat);
