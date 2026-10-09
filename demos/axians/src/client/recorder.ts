// Mic button: click to start, click to stop → ElevenLabs transcription → onText.
import { api } from "./api.ts";
import { h } from "./dom.ts";

export function micButton(onText: (text: string) => void, onError: (e: unknown) => void) {
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  const btn = h("button", { class: "mic", type: "button", title: "Dyktuj" }, "🎙 Dyktuj");
  btn.addEventListener("click", async () => {
    if (rec?.state === "recording") {
      rec.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream);
      chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.classList.remove("recording");
        btn.textContent = "⏳ Rozpoznaję…";
        btn.disabled = true;
        try {
          const { text } = await api.stt(new Blob(chunks, { type: rec!.mimeType }));
          onText(text);
        } catch (e) {
          onError(e);
        } finally {
          btn.disabled = false;
          btn.textContent = "🎙 Dyktuj";
        }
      };
      rec.start();
      btn.classList.add("recording");
      btn.textContent = "⏹ Zakończ";
    } catch (e) {
      onError(e);
    }
  });
  return btn;
}
