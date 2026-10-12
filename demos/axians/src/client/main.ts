import { api } from "./api.ts";
import { $ } from "./dom.ts";
import { mountTechnik } from "./technik.ts";
import { mountKierownik } from "./kierownik.ts";

const views = { technik: $("#technik"), voice: $("#voice"), kierownik: $("#kierownik") };

// The voice tab pulls in the WebRTC SDK — load it only when first opened.
let voiceMounted = false;
function mountVoiceOnce() {
  if (voiceMounted) return;
  voiceMounted = true;
  import("./voice.ts").then((m) => m.mountVoice(views.voice));
}

function show(tab: keyof typeof views) {
  if (tab === "voice") mountVoiceOnce();
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
// #technik / #voice / #kierownik in the URL wins over the remembered tab (handy for demo links)
const fromHash = location.hash.slice(1);
if (fromHash in views) show(fromHash as keyof typeof views);
else try { const t = localStorage.getItem("tab"); if (t === "kierownik" || t === "voice") show(t); } catch { /* ignore */ }
