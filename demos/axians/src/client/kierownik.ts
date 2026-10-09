// Service manager view: natural-language questions over the ticket history.
import { Chart, BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { api, type ManagerResult } from "./api.ts";
import { h, errorBox, hint } from "./dom.ts";

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const EXAMPLES = [
  "Które urządzenia miały najwięcej powtórnych awarii w ostatnim kwartale?",
  "Ile średnio trwa naprawa agregatów u PEC Borówiec?",
  "Jak zmieniała się liczba awarii pomp w ostatnim roku, miesiąc po miesiącu?",
  "Jakie są najczęstsze przyczyny awarii agregatów?",
];

let chart: Chart | null = null;

export function mountKierownik(root: HTMLElement) {
  const input = h("input", { type: "text", placeholder: "Zapytaj o dane serwisowe…" });
  const result = h("div");
  const btn = h("button", { type: "button", class: "primary" }, "Zapytaj");
  const run = async () => {
    if (!input.value.trim()) return;
    btn.disabled = true;
    result.replaceChildren(h("div", { class: "working" }, "Tłumaczę pytanie na zapytanie i liczę…"));
    try {
      render(result, await api.manager(input.value));
    } catch (e) {
      result.replaceChildren(errorBox(e));
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => e.key === "Enter" && run());

  root.replaceChildren(
    h("div", { class: "wide" },
      h("div", { class: "card" },
        h("h2", {}, "Analityka historii zgłoszeń"),
        hint("Kierownik serwisu pyta o dane językiem naturalnym — bez raportów i bez znajomości SQL. Wybierz przykład albo wpisz własne pytanie.",
          "AI zamienia pytanie na precyzyjne zapytanie do danych, a wyliczenia wykonuje system — liczby są dokładne i powtarzalne, nie „zgadywane”. Na końcu AI podsumowuje wynik jednym zdaniem. U klienta to samo zapytanie trafia bezpośrednio do jego systemu (np. SAP)."),
        h("div", { class: "row grow" }, input, btn),
        h("div", { class: "row wrap" }, ...EXAMPLES.map((q) => h("button", { type: "button", class: "chip", onclick: () => { input.value = q; run(); } }, q))),
      ),
      result,
    ),
  );
}

function render(root: HTMLElement, r: ManagerResult) {
  const canvas = h("canvas", { height: 260 });
  chart?.destroy();
  root.replaceChildren(
    h("div", { class: "card" },
      h("h2", {}, r.title),
      h("p", { class: "takeaway" }, r.takeaway),
      r.chart !== "none" && r.rows.length ? h("div", { class: "chart" }, canvas) : null,
      h("table", {},
        h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", { class: "num" }, r.valueLabel), h("th", { class: "num" }, "zgłoszeń w grupie"))),
        h("tbody", {}, ...r.rows.map((row) => h("tr", {}, h("td", {}, row.label), h("td", { class: "num" }, String(row.value)), h("td", { class: "num muted" }, String(row.tickets))))),
      ),
      h("details", { class: "query" }, h("summary", {}, "Pokaż zapytanie"),
        hint("Tak AI zrozumiało pytanie: jakie dane wybrać, jak je pogrupować i co policzyć. AI tylko opisuje zapytanie — nie ma bezpośredniego dostępu do zmiany danych, a wynik liczy system."),
        h("pre", {}, JSON.stringify(r.query, null, 2))),
    ),
  );
  if (r.chart === "none" || !r.rows.length) return;
  const css = getComputedStyle(document.documentElement);
  chart = new Chart(canvas, {
    type: r.chart,
    data: {
      labels: r.rows.map((x) => (x.label.length > 38 ? x.label.slice(0, 36) + "…" : x.label)),
      datasets: [{ label: r.valueLabel, data: r.rows.map((x) => x.value), backgroundColor: css.getPropertyValue("--accent"), borderColor: css.getPropertyValue("--accent"), borderRadius: 4 }],
    },
    options: {
      indexAxis: r.chart === "bar" && r.rows.length > 4 ? "y" : "x",
      maintainAspectRatio: false,
      plugins: { tooltip: { enabled: true } },
      scales: { x: { ticks: { color: css.getPropertyValue("--muted") } }, y: { ticks: { color: css.getPropertyValue("--muted") }, beginAtZero: true } },
    },
  });
}
