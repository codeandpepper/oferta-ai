// Technician — voice agent: the whole flow driven by a conversational agent (ElevenLabs Agents).
// The agent talks; its client tools run here in the browser, call our API and update the
// "technician's screen" with the same components as the classic view.
import { Conversation, type Status, type Mode } from "@elevenlabs/client";
import { api, type Answer, type Device, type Protocol, type Weather, type WeatherOpts } from "./api.ts";
import { h, errorBox, hint, fmtDate } from "./dom.ts";
import { renderAnswer, renderPlate, renderWeather, shrink } from "./technik.ts";
import { samplePlate } from "./plate.ts";

type VoiceConversation = Awaited<ReturnType<typeof Conversation.startSession>>;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

export async function mountVoice(root: HTMLElement) {
  const devices = await api.devices();
  let conversation: VoiceConversation | null = null;
  let device: Device | null = null;
  let lastQuestion = "";
  let lastAnswer: Answer | null = null;
  let draft: { note: string; protocol: Protocol } | null = null;

  // ---------------------------------------------------------------- conversation panel
  const transcript = h("div", { class: "transcript", "aria-live": "polite" });
  const statusPill = h("span", { class: "status-pill" }, "Rozłączony");
  const startBtn = h("button", { type: "button", class: "primary big-mic" }, "🎙 Rozpocznij rozmowę");
  const muteBtn = h("button", { type: "button", class: "ghost small", hidden: true }, "🔇 Wycisz mikrofon");
  const textInput = h("input", { type: "text", placeholder: "…albo napisz do agenta", disabled: true });
  const sendBtn = h("button", { type: "button", class: "small", disabled: true }, "Wyślij");

  function say(role: "user" | "agent" | "tool", text: string) {
    const el = h("div", { class: `bubble ${role}` }, role === "tool" ? text : h("span", {}, text));
    transcript.append(el);
    transcript.scrollTop = transcript.scrollHeight;
    return el;
  }

  function setStatus(s: Status | Mode | "error") {
    const labels: Record<string, string> = { disconnected: "Rozłączony", connecting: "Łączenie…", connected: "Połączony", disconnecting: "Rozłączanie…", speaking: "🔊 Agent mówi", listening: "👂 Słucham", error: "Błąd" };
    statusPill.textContent = labels[s] ?? s;
    statusPill.dataset.state = s;
  }

  let muted = false;
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    conversation?.setMicMuted(muted);
    muteBtn.textContent = muted ? "🎙 Włącz mikrofon" : "🔇 Wycisz mikrofon";
  });

  // Speaker mode: mute the mic while the agent talks, so laptop speakers can't feed its own
  // voice back as "user speech" (echo). Turn off when using headphones.
  let speakerMode = true;
  try { speakerMode = localStorage.getItem("voiceSpeakerMode") !== "0"; } catch { /* storage unavailable */ }
  const speakerToggle = h("label", { class: "toggle", title: "Mikrofon wyciszany, gdy agent mówi — zapobiega echu z głośników. Wyłącz przy słuchawkach." },
    h("input", { type: "checkbox", checked: speakerMode }), "Tryb głośnika (bez echa)");
  speakerToggle.querySelector("input")!.addEventListener("change", (e) => {
    speakerMode = (e.target as HTMLInputElement).checked;
    try { localStorage.setItem("voiceSpeakerMode", speakerMode ? "1" : "0"); } catch { /* ignore */ }
    if (!speakerMode) conversation?.setMicMuted(muted);
  });
  function onMode(mode: Mode) {
    setStatus(mode);
    if (speakerMode) conversation?.setMicMuted(muted || mode === "speaking");
  }
  const sendText = () => {
    const t = textInput.value.trim();
    if (!t || !conversation) return;
    conversation.sendUserMessage(t);
    say("user", t);
    textInput.value = "";
  };
  sendBtn.addEventListener("click", sendText);
  textInput.addEventListener("keydown", (e) => e.key === "Enter" && sendText());

  startBtn.addEventListener("click", async () => {
    if (conversation) {
      await conversation.endSession();
      return;
    }
    startBtn.disabled = true;
    setStatus("connecting");
    try {
      const { token } = await fetch("api/voice/token").then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? r.statusText);
        return body as { token: string };
      });
      conversation = await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        dynamicVariables: { today: new Date().toISOString().slice(0, 10) },
        clientTools,
        onMessage: (m) => say(m.role === "user" ? "user" : "agent", m.message),
        onModeChange: ({ mode }) => onMode(mode),
        onStatusChange: ({ status }) => setStatus(status),
        onError: (message) => { say("tool", `⚠ ${message}`); setStatus("error"); },
        onDisconnect: () => {
          conversation = null;
          setStatus("disconnected");
          startBtn.textContent = "🎙 Rozpocznij rozmowę";
          muteBtn.hidden = true;
          textInput.disabled = sendBtn.disabled = true;
        },
      });
      startBtn.textContent = "⏹ Zakończ rozmowę";
      muteBtn.hidden = false;
      textInput.disabled = sendBtn.disabled = false;
      // a nameplate photo taken before the call → tell the agent right away
      if (device) conversation.sendContextualUpdate(`Technik wybrał już urządzenie ${device.id}: ${device.manufacturer} ${device.model}, ${device.client}, ${device.location}.`);
    } catch (e) {
      say("tool", `⚠ ${e instanceof Error ? e.message : String(e)}`);
      setStatus("error");
    } finally {
      startBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------- technician's screen
  const deviceStatus = h("div");
  const deviceInfo = h("div");
  const progress = h("ul", { class: "progress" });
  const answerBox = h("div");
  const protoBox = h("div");

  let demoWeather = false;
  try { demoWeather = localStorage.getItem("demoWeather") === "1"; } catch { /* storage unavailable */ }
  const demoToggle = h("label", { class: "toggle", title: "Zapisany deszczowy tydzień — przewidywalny przebieg pokazu" }, h("input", { type: "checkbox", checked: demoWeather }), "Pogoda: tryb demo");
  demoToggle.querySelector("input")!.addEventListener("change", (e) => {
    demoWeather = (e.target as HTMLInputElement).checked;
    try { localStorage.setItem("demoWeather", demoWeather ? "1" : "0"); } catch { /* ignore */ }
  });
  const weatherOpts = (): WeatherOpts => ({ demo: demoWeather });

  async function showDevice(d: Device) {
    device = d;
    const history = await api.deviceTickets(d.id);
    deviceInfo.replaceChildren(
      h("dl", { class: "kv" },
        h("dt", {}, "Urządzenie"), h("dd", {}, `${d.id} · ${d.manufacturer} ${d.model}`),
        h("dt", {}, "Klient"), h("dd", {}, d.client),
        h("dt", {}, "Lokalizacja"), h("dd", {}, d.location),
      ),
    );
    return history;
  }

  let photoUrl: string | null = null;
  async function identify(original: Blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(original);
    const photo = h("img", { class: "plate-photo", src: photoUrl, alt: "Zdjęcie tabliczki znamionowej" });
    deviceStatus.replaceChildren(photo, h("div", { class: "working" }, "Odczytuję tabliczkę znamionową…"));
    try {
      const r = await api.identify(await shrink(original));
      deviceStatus.replaceChildren(photo, renderPlate(r.plate, r.device, r.matchedBy));
      if (r.device) await showDevice(r.device);
      const read = [r.plate.manufacturer, r.plate.model].filter(Boolean).join(" ");
      const ids = r.plate.identifiers.map((i) => `${i.label} ${i.value}`).join(", ");
      conversation?.sendUserMessage(
        `[Zdjęcie tabliczki] Odczytano: ${read || "nieczytelne"}${ids ? ` (${ids})` : ""}. Warunki zdjęcia: ${r.plate.photoConditions}. ` +
          (r.device ? `Dopasowane urządzenie w ewidencji: ${r.device.id} — ${r.device.client}, ${r.device.location}.` : "Brak dopasowania w ewidencji."),
      );
      if (conversation) say("tool", "📷 Zdjęcie tabliczki odczytane i przekazane agentowi");
    } catch (e) {
      deviceStatus.replaceChildren(photo, errorBox(e));
    }
  }
  const fileInput = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true });
  fileInput.addEventListener("change", () => fileInput.files?.[0] && identify(fileInput.files[0]));

  function renderProtocolView(p: Protocol) {
    const row = (k: string, v: string) => [h("dt", {}, k), h("dd", {}, v || "—")];
    return h("div", { class: "workorder" },
      h("div", { class: "wo-head" }, h("span", {}, "Zlecenie serwisowe — protokół"), h("span", { class: `prio prio-${p.priority}` }, p.priority)),
      device ? h("div", { class: "wo-meta mono" }, `${device.id} · ${device.manufacturer} ${device.model} · kat. ${p.category}`) : null,
      h("dl", { class: "kv" },
        ...row("Objaw", p.symptom),
        ...row("Przyczyna", p.cause),
        ...row("Czynności", p.actions.join("; ")),
        ...row("Części", p.partsUsed.map((x) => `${x.qty}× ${x.partNo ?? ""} ${x.name}`).join("; ")),
        ...row("Czas pracy", `${p.repairMinutes} min`),
        ...row("Zalecenia", p.recommendations.join("; ")),
        ...row("Następny przegląd", p.nextServiceAt ?? ""),
      ),
      p.missing.length
        ? h("div", { class: "missing" }, h("strong", {}, "Agent dopytuje o: "), h("ul", {}, ...p.missing.map((m) => h("li", {}, m))))
        : h("div", { class: "complete" }, "✓ Protokół kompletny — agent zapyta o zgodę na zapis"),
    );
  }

  // ---------------------------------------------------------------- client tools (called by the agent)
  const clientTools = {
    find_device: ({ query }: { query: string }) => {
      const words = norm(query).split(/[^a-z0-9-]+/).filter((w) => w.length > 1);
      const scored = devices
        .map((d) => {
          const hay = norm(`${d.id} ${d.type} ${d.manufacturer} ${d.model} ${d.client} ${d.location}`);
          return { d, score: words.filter((w) => hay.includes(w)).length };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      say("tool", `🔎 Szukam urządzenia: „${query}” → ${scored.map((x) => x.d.id).join(", ") || "brak"}`);
      return JSON.stringify(scored.map(({ d }) => ({ id: d.id, urzadzenie: `${d.manufacturer} ${d.model}`, typ: d.type, klient: d.client, lokalizacja: d.location })));
    },

    select_device: async ({ device_id }: { device_id: string }) => {
      const d = devices.find((x) => x.id.toLowerCase() === device_id.trim().toLowerCase());
      if (!d) return `Błąd: nie ma urządzenia ${device_id}.`;
      const history = await showDevice(d);
      say("tool", `✓ Wybrano urządzenie ${d.id}`);
      return JSON.stringify({
        id: d.id, urzadzenie: `${d.manufacturer} ${d.model}`, klient: d.client, lokalizacja: d.location,
        ostatnie_wpisy: history.slice(0, 3).map((t) => `${fmtDate(t.openedAt)}: ${t.symptom} — ${t.note}`),
      });
    },

    search_service_knowledge: async ({ question }: { question: string }) => {
      if (!device) return "Błąd: najpierw ustal urządzenie (zdjęcie tabliczki albo find_device / select_device).";
      lastQuestion = question;
      say("tool", "🔧 Przeszukuję wiedzę serwisową…");
      progress.replaceChildren(h("li", { class: "working" }, "Agent wybiera źródła wiedzy…"));
      answerBox.replaceChildren();
      let weather: { data: Weather; reason: string } | null = null;
      try {
        for await (const ev of api.ask(device.id, question, weatherOpts(), true)) {
          if (ev.type === "tool") {
            progress.querySelector(".working")?.remove();
            if (ev.name === "get_weather") {
              const reason = (ev.input as { reason?: string }).reason ?? "";
              weather = { data: ev.data as Weather, reason };
              progress.append(h("li", { class: "done weather-step" }, "🌦 AI sprawdza pogodę z ostatnich 7 dni", reason ? h("span", { class: "muted" }, ` — ${reason}`) : null));
            } else {
              progress.append(h("li", { class: "done" }, `✓ ${ev.label}`, h("span", { class: "muted" }, ` · ${ev.resultCount} wyn.`)));
            }
            progress.append(h("li", { class: "working" }, "Szukam dalej…"));
          } else if (ev.type === "answer") {
            progress.querySelector(".working")?.remove();
            lastAnswer = ev.answer;
            const el = renderAnswer(ev.answer, ev.refs);
            if (weather) el.querySelector(".summary")!.after(renderWeather(weather.data, weather.reason));
            answerBox.replaceChildren(el);
            // compact version for the agent to speak from — full detail stays on screen
            return JSON.stringify({
              podsumowanie: ev.answer.summary,
              pogoda_sprawdzona: weather ? weather.reason : null,
              sekcje: ev.answer.sections.map((s) => ({ zrodlo: s.kind, tresc: s.text })),
              kroki: ev.answer.steps.slice(0, 4),
            });
          } else {
            progress.querySelector(".working")?.remove();
            answerBox.replaceChildren(errorBox(ev.message));
            return `Błąd: ${ev.message}`;
          }
        }
        return "Błąd: brak odpowiedzi.";
      } catch (e) {
        progress.querySelector(".working")?.remove();
        answerBox.replaceChildren(errorBox(e));
        return `Błąd: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    draft_protocol: async ({ note }: { note: string }) => {
      if (!device) return "Błąd: najpierw ustal urządzenie.";
      say("tool", "📝 Tworzę protokół…");
      protoBox.replaceChildren(h("div", { class: "working" }, "Porządkuję notatkę w protokół…"));
      try {
        const context = lastQuestion ? `Pytanie technika: „${lastQuestion}”. Diagnoza asystenta: ${lastAnswer?.summary ?? "—"}` : undefined;
        const protocol = await api.protocol(device.id, note, context);
        draft = { note, protocol };
        protoBox.replaceChildren(renderProtocolView(protocol));
        return JSON.stringify({
          kompletny: protocol.missing.length === 0,
          brakuje: protocol.missing,
          protokol: { objaw: protocol.symptom, przyczyna: protocol.cause, czynnosci: protocol.actions, czesci: protocol.partsUsed.map((p) => p.partNo ?? p.name), czas_min: protocol.repairMinutes, nastepny_przeglad: protocol.nextServiceAt },
        });
      } catch (e) {
        protoBox.replaceChildren(errorBox(e));
        return `Błąd: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    save_ticket: async () => {
      if (!device || !draft) return "Błąd: nie ma protokołu do zapisania — najpierw draft_protocol.";
      try {
        const t = await api.saveTicket(device.id, draft.note, draft.protocol);
        protoBox.append(h("div", { class: "saved" }, `✓ Zapisano zgłoszenie ${t.id} — od teraz jest częścią wiedzy serwisowej.`));
        say("tool", `💾 Zapisano zgłoszenie ${t.id}`);
        await showDevice(device);
        return `Zapisano zgłoszenie ${t.id}.`;
      } catch (e) {
        return `Błąd zapisu: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };

  // ---------------------------------------------------------------- layout
  root.replaceChildren(
    h("div", { class: "voice-layout" },
      h("div", { class: "card voice-call" },
        h("h2", {}, "🎙 Rozmowa z agentem", h("span", { class: "beta-badge" }, "beta")),
        h("div", { class: "beta-note" }, "⚠ Funkcja eksperymentalna — nie w pełni przetestowana. Jakość rozpoznawania i wymowy po polsku może się różnić; na demo najlepiej słuchawki."),
        hint("Ten sam proces co w zakładce „Technik”, ale prowadzony w całości głosem: technik mówi, agent dopytuje, sam sięga do wiedzy serwisowej i wypełnia protokół. Ręce zostają wolne.",
          "Agent głosowy rozumie potoczną polszczyznę, sam decyduje, kiedy użyć którego narzędzia, a wyniki pokazuje na ekranie obok. To drugie doświadczenie zbudowane na tej samej warstwie wiedzy."),
        h("div", { class: "row" }, startBtn, statusPill, muteBtn),
        h("div", { class: "row" }, speakerToggle, h("span", { class: "muted small-label" }, "· na demo najlepiej słuchawki")),
        transcript,
        h("div", { class: "row grow" }, textInput, sendBtn),
      ),
      h("div", { class: "voice-screen" },
        h("div", { class: "card" },
          h("h2", {}, "📱 Ekran technika"),
          h("div", { class: "row wrap" },
            h("button", { type: "button", onclick: () => fileInput.click() }, "📷 Zdjęcie tabliczki"),
            h("button", { type: "button", class: "ghost", title: "Prawdziwe zdjęcie tabliczki starego agregatu", onclick: async () => identify(await (await fetch("samples/tabliczka_znamionowa_agregat.jpg")).blob()) }, "Zdjęcie z terenu"),
            h("button", { type: "button", class: "ghost", onclick: async () => identify(await samplePlate(devices.find((d) => d.id === "AG-003")!)) }, "Przykładowa tabliczka"),
            demoToggle,
          ),
          fileInput,
          deviceStatus,
          deviceInfo,
        ),
        h("div", { class: "card" }, h("h2", {}, "🔧 Wiedza serwisowa"), progress, answerBox,
          hint("Tu pojawiają się wyniki, gdy agent przeszuka wiedzę — pełne szczegóły ze źródłami, a agent mówi tylko najważniejsze.")),
        h("div", { class: "card" }, h("h2", {}, "📝 Protokół"), protoBox,
          hint("Agent buduje protokół z tego, co technik powie, dopytuje o braki i zapisuje dopiero po potwierdzeniu.")),
      ),
    ),
  );
}
