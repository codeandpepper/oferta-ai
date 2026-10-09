// ElevenLabs Scribe speech-to-text (Polish). Plain fetch keeps the dependency list short.
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Brak ELEVENLABS_API_KEY");
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", "pol");
  form.append("tag_audio_events", "false");
  form.append("file", audio, filename);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { text: string };
  return json.text.trim();
}
