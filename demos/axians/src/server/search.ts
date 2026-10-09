// Lightweight lexical search: TF-IDF over character trigrams of normalized words.
// Robust to typos, missing Polish diacritics and inflection ("paliwo/paliwa/paliwem"),
// zero dependencies, a few MB of RAM. Claude adds the semantic part by writing
// the query (synonyms, abbreviations) and judging the returned candidates.

const DIACRITICS: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

// Common technician shorthand → full word (applied after normalization).
const ABBREV: Record<string, string> = {
  wym: "wymiana", pal: "paliwa", pow: "powietrza", aku: "akumulator", obc: "obciazenie",
  przegl: "przeglad", kontr: "kontrolka", poz: "poziom", zabezp: "zabezpieczono", nast: "nastepny",
  ukl: "uklad", agr: "agregat", cisn: "cisnienie", usz: "uszczelka", ostrz: "ostrzezenie",
  zablok: "zablokowana", temp: "temperatura", riz: "rezystancja izolacji", kwart: "kwartalny",
};

export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => DIACRITICS[c])
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (ABBREV[w] ?? w).split(" "));
}

function grams(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const w of normalize(text)) {
    if (w.length < 2) continue;
    const padded = ` ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      const g = padded.slice(i, i + 3);
      tf.set(g, (tf.get(g) ?? 0) + 1);
    }
  }
  return tf;
}

export interface Hit<T> {
  item: T;
  score: number;
}

export class LexicalIndex<T> {
  private vecs: Map<string, number>[] = [];
  private idf = new Map<string, number>();
  private items: T[] = [];
  private textOf: (item: T) => string;

  constructor(items: T[], textOf: (item: T) => string) {
    this.textOf = textOf;
    this.rebuild(items);
  }

  /** Corpus is tiny (hundreds of items), so a full rebuild on every change is fine. */
  rebuild(items: T[]) {
    this.items = items;
    const tfs = items.map((it) => grams(this.textOf(it)));
    const df = new Map<string, number>();
    for (const tf of tfs) for (const g of tf.keys()) df.set(g, (df.get(g) ?? 0) + 1);
    this.idf = new Map([...df].map(([g, n]) => [g, Math.log(1 + items.length / n)]));
    this.vecs = tfs.map((tf) => this.weigh(tf));
  }

  private weigh(tf: Map<string, number>): Map<string, number> {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [g, n] of tf) {
      const w = (1 + Math.log(n)) * (this.idf.get(g) ?? 0);
      if (w > 0) { v.set(g, w); norm += w * w; }
    }
    norm = Math.sqrt(norm) || 1;
    for (const [g, w] of v) v.set(g, w / norm);
    return v;
  }

  search(query: string, k: number, filter?: (item: T) => boolean): Hit<T>[] {
    const q = this.weigh(grams(query));
    const hits: Hit<T>[] = [];
    this.items.forEach((item, i) => {
      if (filter && !filter(item)) return;
      let s = 0;
      for (const [g, w] of q) s += w * (this.vecs[i].get(g) ?? 0);
      if (s > 0) hits.push({ item, score: s });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
