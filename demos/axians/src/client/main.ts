import { api } from "./api.ts";
import { $ } from "./dom.ts";
import { mountTechnik } from "./technik.ts";
import { mountKierownik } from "./kierownik.ts";

const views = { technik: $("#technik"), kierownik: $("#kierownik") };

function show(tab: keyof typeof views) {
  for (const [name, el] of Object.entries(views)) el.hidden = name !== tab;
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  try { localStorage.setItem("tab", tab); } catch { /* storage unavailable */ }
}
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab as keyof typeof views)));

// Explainers (hints) toggle — remembered per browser.
const hintsBtn = $("#hints");
function setHints(on: boolean) {
  document.body.classList.toggle("hints-off", !on);
  hintsBtn.setAttribute("aria-pressed", String(on));
  try { localStorage.setItem("hints", on ? "on" : "off"); } catch { /* storage unavailable */ }
}
hintsBtn.addEventListener("click", () => setHints(document.body.classList.contains("hints-off")));
try { setHints(localStorage.getItem("hints") !== "off"); } catch { setHints(true); }

$("#reset").addEventListener("click", async () => {
  if (!confirm("Przywrócić dane startowe? Zgłoszenia dodane w demo zostaną usunięte.")) return;
  await api.reset();
  await mountTechnik(views.technik);
});

mountTechnik(views.technik);
mountKierownik(views.kierownik);
try { const t = localStorage.getItem("tab"); if (t === "kierownik") show(t); } catch { /* ignore */ }
