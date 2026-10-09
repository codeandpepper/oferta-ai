// Technician view: device → problem (multi-source answer) → closing protocol → ask again.
import { api, type Answer, type Device, type Protocol, type Ref } from "./api.ts";
import { h, fmtDate, errorBox, hint } from "./dom.ts";
import { micButton } from "./recorder.ts";
import { samplePlate } from "./plate.ts";

const SAMPLE_PROBLEM = "Agregat nie startuje, kontrolka paliwa miga, wczoraj padało.";
const SAMPLE_NOTE =
  "no więc tak, w odstojniku była woda, spuściłem, filtr paliwa wymieniony, korek wlewu też bo uszczelka pękła, kostkę czujnika paliwa wymieniłem na tą nową uszczelnioną co zalecali w marcu, odpalił za drugim razem, test pół godziny pod obciążeniem ok, zeszło mi jakieś półtorej godziny";

const KIND: Record<Answer["sections"][number]["kind"], { label: string; cls: string; how: string }> = {
  historia_typ: { label: "Historia zgłoszeń — ten typ", cls: "k-type", how: "Wyszukiwanie w notatkach techników (odporne na skróty i literówki) + zapytanie strukturalne: ile podobnych przypadków, jakie przyczyny, średni czas naprawy." },
  historia_egzemplarz: { label: "Historia — ten egzemplarz", cls: "k-unit", how: "Zapytanie strukturalne po ID urządzenia: ostatnie wizyty, uwagi i zalecenia techników." },
  dokumentacja: { label: "Dokumentacja (DTR)", cls: "k-doc", how: "Przeszukiwanie instrukcji producenta — cytat z numerem strony; odnośnik otwiera dokument na tej stronie." },
  czesci: { label: "Katalog części", cls: "k-parts", how: "Dodatkowe źródło: numery części, zamienniki, stany. Pokazuje, że kolejne źródła dokłada się bez przebudowy." },
};

export async function mountTechnik(root: HTMLElement) {
  const devices = await api.devices();
  let device: Device | null = null;
  let lastQuestion = "";
  let lastAnswer: Answer | null = null;

  // ---- step 1: device ---------------------------------------------------------
  const deviceInfo = h("div", { class: "device-info" });
  const deviceStatus = h("div");
  const select = h("select", { "aria-label": "Wybierz urządzenie" },
    h("option", { value: "" }, "— wybierz z listy —"),
    ...devices.map((d) => h("option", { value: d.id }, `${d.id} · ${d.manufacturer} ${d.model} · ${d.client}`)),
  );
  select.addEventListener("change", () => setDevice(devices.find((d) => d.id === select.value) ?? null));

  const fileInput = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true });
  fileInput.addEventListener("change", () => fileInput.files?.[0] && identify(fileInput.files[0]));

  let photoUrl: string | null = null;
  async function identify(image: Blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(image);
    const photo = h("img", { class: "plate-photo", src: photoUrl, alt: "Zdjęcie tabliczki znamionowej" });
    deviceStatus.replaceChildren(photo, h("div", { class: "working" }, "Odczytuję tabliczkę znamionową…"));
    try {
      const r = await api.identify(image);
      const read = [r.plate.manufacturer, r.plate.model, r.plate.serial].filter(Boolean).join(" · ");
      deviceStatus.replaceChildren(
        photo,
        h("div", { class: "plate-read" }, h("strong", {}, "Odczytano: "), read || "nieczytelne",
          r.device ? h("span", { class: "ok" }, ` ✓ dopasowano w ewidencji (${r.matchedBy === "serial" ? "po nr seryjnym" : "po modelu"})`) : h("span", { class: "warn" }, " — brak w ewidencji")),
      );
      if (r.device) { select.value = r.device.id; setDevice(r.device); }
    } catch (e) {
      deviceStatus.replaceChildren(photo, errorBox(e));
    }
  }

  async function setDevice(d: Device | null) {
    device = d;
    problemCard.hidden = !d;
    closeCard.hidden = true;
    if (!d) { deviceInfo.replaceChildren(); return; }
    const history = await api.deviceTickets(d.id);
    deviceInfo.replaceChildren(
      h("dl", { class: "kv" },
        h("dt", {}, "Urządzenie"), h("dd", {}, `${d.manufacturer} ${d.model}`),
        h("dt", {}, "Nr seryjny"), h("dd", { class: "mono" }, d.serial),
        h("dt", {}, "Klient"), h("dd", {}, d.client),
        h("dt", {}, "Lokalizacja"), h("dd", {}, d.location),
      ),
      h("details", { class: "history" },
        h("summary", {}, `Historia zgłoszeń egzemplarza (${history.length})`),
        hint("Surowe wpisy z historii zgłoszeń — tak naprawdę wyglądają notatki techników: skróty, literówki, niepełne zdania. Na tym AI musi sobie radzić."),
        h("ul", {}, ...history.slice(0, 8).map((t) => h("li", { class: t.isNew ? "new" : "" }, h("span", { class: "mono" }, `${fmtDate(t.openedAt)} `), `${t.symptom} — `, h("em", {}, t.note)))),
      ),
    );
  }

  const deviceCard = h("div", { class: "card" },
    h("h2", {}, h("span", { class: "step" }, "1"), "Urządzenie"),
    hint("Przy jakim urządzeniu stoi technik: zdjęcie tabliczki znamionowej, przykładowa tabliczka (gdy nie ma aparatu) albo wybór z listy.",
      "AI odczytuje ze zdjęcia producenta, model i numer seryjny, a system sam odnajduje urządzenie w ewidencji (u klienta: SAP EAM / NEO). Bez ręcznego przepisywania."),
    h("div", { class: "row" },
      h("button", { type: "button", onclick: () => fileInput.click() }, "📷 Zdjęcie tabliczki"),
      h("button", { type: "button", class: "ghost", onclick: async () => {
        const demo = devices.find((d) => d.id === "AG-003")!;
        await identify(await samplePlate(demo));
      } }, "Przykładowa tabliczka"),
    ),
    fileInput,
    select,
    deviceStatus,
    deviceInfo,
  );

  // ---- step 2: problem → multi-source answer ---------------------------------
  const question = h("textarea", { rows: 3, placeholder: "Opisz problem (albo podyktuj)…" });
  const progress = h("ul", { class: "progress" });
  const answerBox = h("div");
  const askBtn = h("button", { type: "button", class: "primary" }, "Szukaj w wiedzy serwisowej");
  askBtn.addEventListener("click", () => runAsk(question.value));

  async function runAsk(q: string) {
    if (!device || !q.trim()) return;
    lastQuestion = q;
    askBtn.disabled = true;
    progress.replaceChildren(h("li", { class: "working" }, "Analizuję pytanie i wybieram źródła…"));
    answerBox.replaceChildren();
    try {
      for await (const ev of api.ask(device.id, q)) {
        if (ev.type === "tool") {
          progress.lastElementChild?.classList.contains("working") && progress.lastElementChild.remove();
          progress.append(h("li", { class: "done" }, `✓ ${ev.label}`, h("span", { class: "muted" }, ` · ${ev.resultCount} wyn.`)));
          progress.append(h("li", { class: "working" }, "Szukam dalej…"));
        } else if (ev.type === "answer") {
          progress.querySelector(".working")?.remove();
          lastAnswer = ev.answer;
          answerBox.replaceChildren(renderAnswer(ev.answer, ev.refs));
          closeCard.hidden = false;
        } else {
          progress.querySelector(".working")?.remove();
          answerBox.replaceChildren(errorBox(ev.message));
        }
      }
    } catch (e) {
      progress.querySelector(".working")?.remove();
      answerBox.replaceChildren(errorBox(e));
    } finally {
      askBtn.disabled = false;
    }
  }

  const problemCard = h("div", { class: "card", hidden: true },
    h("h2", {}, h("span", { class: "step" }, "2"), "Opis problemu"),
    hint("Technik opisuje problem własnymi słowami — pisząc albo dyktując.",
      "AI rozumie mowę po polsku, także potoczną i z żargonem. Następnie asystent sam decyduje, które źródła wiedzy przeszukać — postęp widać na żywo poniżej — i składa jedną odpowiedź, w której każdy fragment ma wskazane źródło."),
    question,
    h("div", { class: "row" },
      micButton((t) => (question.value = t), (e) => answerBox.replaceChildren(errorBox(e))),
      h("button", { type: "button", class: "chip", onclick: () => (question.value = SAMPLE_PROBLEM) }, "Przykład"),
      askBtn,
    ),
    progress,
    answerBox,
  );

  // ---- step 3: closing note → protocol → save ---------------------------------
  const note = h("textarea", { rows: 4, placeholder: "Co zostało zrobione? (dyktuj swobodnie)" });
  const protoBox = h("div");
  const protoBtn = h("button", { type: "button", class: "primary" }, "Utwórz protokół");
  protoBtn.addEventListener("click", async () => {
    if (!device || !note.value.trim()) return;
    protoBtn.disabled = true;
    protoBox.replaceChildren(h("div", { class: "working" }, "Porządkuję notatkę w protokół…"));
    try {
      const p = await api.protocol(device.id, note.value, lastQuestion ? `Pytanie technika: „${lastQuestion}”. Diagnoza asystenta: ${lastAnswer?.summary ?? "—"}` : undefined);
      protoBox.replaceChildren(renderProtocol(p));
    } catch (e) {
      protoBox.replaceChildren(errorBox(e));
    } finally {
      protoBtn.disabled = false;
    }
  });

  function renderProtocol(p: Protocol) {
    const field = (label: string, value: string, multiline = false) => {
      const input = multiline ? h("textarea", { rows: Math.max(2, value.split("\n").length) }) : h("input", { type: "text" });
      input.value = value;
      return { el: h("label", { class: "field" }, h("span", {}, label), input), get: () => input.value };
    };
    const f = {
      symptom: field("Objaw", p.symptom),
      cause: field("Przyczyna", p.cause),
      actions: field("Czynności", p.actions.join("\n"), true),
      parts: field("Części", p.partsUsed.map((x) => `${x.qty}× ${x.partNo ? x.partNo + " " : ""}${x.name}`).join("\n"), true),
      minutes: field("Czas pracy [min]", String(p.repairMinutes)),
      recs: field("Zalecenia", p.recommendations.join("\n"), true),
      next: field("Następny przegląd", p.nextServiceAt ?? ""),
    };
    const status = h("div");
    const saveBtn = h("button", { type: "button", class: "primary" }, "Zapisz zgłoszenie w systemie");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      const edited: Protocol = {
        ...p,
        symptom: f.symptom.get(),
        cause: f.cause.get(),
        actions: f.actions.get().split("\n").filter(Boolean),
        repairMinutes: Number(f.minutes.get()) || p.repairMinutes,
        recommendations: f.recs.get().split("\n").filter(Boolean),
        nextServiceAt: f.next.get() || null,
      };
      try {
        const t = await api.saveTicket(device!.id, note.value, edited);
        status.replaceChildren(
          h("div", { class: "saved" }, `✓ Zapisano zgłoszenie ${t.id}. Od teraz jest częścią wiedzy serwisowej.`),
          hint("Pętla wiedzy: zadaj to samo pytanie jeszcze raz — w odpowiedzi pojawi się właśnie zapisane zgłoszenie, oznaczone jako NOWE."),
          h("button", { type: "button", class: "primary", onclick: async () => {
            await setDevice(device);
            problemCard.scrollIntoView({ behavior: "smooth" });
            runAsk(lastQuestion);
          } }, "↻ Zadaj to samo pytanie ponownie"),
        );
      } catch (e) {
        status.replaceChildren(errorBox(e));
        saveBtn.disabled = false;
      }
    });
    return h("div", { class: "workorder" },
      h("div", { class: "wo-head" }, h("span", {}, "Zlecenie serwisowe — protokół"), h("span", { class: `prio prio-${p.priority}` }, p.priority)),
      h("div", { class: "wo-meta mono" }, `${device!.id} · ${device!.manufacturer} ${device!.model} · SN ${device!.serial} · kat. ${p.category}`),
      ...Object.values(f).map((x) => x.el),
      p.missing.length ? h("div", { class: "missing" }, h("strong", {}, "Do uzupełnienia: "), p.missing.join("; ")) : null,
      hint("Zapis tworzy nowe zgłoszenie w historii (u klienta: zlecenie w SAP FSM / ServiceNow).",
        "Od tej chwili asystent bierze je pod uwagę przy kolejnych pytaniach — wiedza rośnie z każdą interwencją, bez kosztownego trenowania AI."),
      saveBtn,
      status,
    );
  }

  const closeCard = h("div", { class: "card", hidden: true },
    h("h2", {}, h("span", { class: "step" }, "3"), "Zamknięcie zlecenia"),
    hint("Technik zamyka zlecenie, mówiąc swobodnie, co zrobił — tak jak w terenie, bez formularza.",
      "AI zamienia chaotyczną notatkę na uporządkowany protokół w stałym formacie (czynności, części z katalogu, czas, zalecenia) i podpowiada, czego brakuje. Pola można poprawić przed zapisem."),
    note,
    h("div", { class: "row" },
      micButton((t) => (note.value = t), (e) => protoBox.replaceChildren(errorBox(e))),
      h("button", { type: "button", class: "chip", onclick: () => (note.value = SAMPLE_NOTE) }, "Przykład"),
      protoBtn,
    ),
    protoBox,
  );

  root.replaceChildren(h("div", { class: "phone" }, deviceCard, problemCard, closeCard));
}

function renderAnswer(a: Answer, refs: Record<string, Ref>) {
  const refChip = (id: string) => {
    const r = refs[id];
    if (!r) return null;
    if (r.kind === "dokumentacja") return h("a", { class: "ref ref-doc", href: r.url, target: "_blank", title: r.detail }, `📄 ${r.label}`);
    const d = h("details", { class: `ref ${r.isNew ? "ref-new" : ""}` },
      h("summary", {}, r.isNew ? h("b", {}, "NOWE ") : null, r.kind === "czesc" ? "🔩 " : "🗂 ", r.label),
      h("pre", {}, r.detail),
    );
    return d;
  };
  return h("div", { class: "answer" },
    h("div", { class: "summary" }, a.summary),
    hint("Kliknij odnośnik pod sekcją, żeby zobaczyć źródłowe zgłoszenie, stronę instrukcji albo część. Odpowiedź opiera się tylko na tym, co agent znalazł."),
    ...a.sections.map((s) =>
      h("div", { class: `section ${KIND[s.kind].cls}` },
        h("div", { class: "badge", title: KIND[s.kind].how }, KIND[s.kind].label),
        hint(KIND[s.kind].how),
        h("h3", {}, s.title),
        h("p", {}, s.text),
        s.refs.length ? h("div", { class: "refs" }, ...s.refs.map(refChip)) : null,
      ),
    ),
    a.steps.length ? h("div", { class: "steps" }, h("h3", {}, "Zalecane kroki"), h("ol", {}, ...a.steps.map((s) => h("li", {}, s)))) : null,
  );
}
