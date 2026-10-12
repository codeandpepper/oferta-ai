// Voice agent (ElevenLabs Agents): the browser gets a short-lived conversation token from us,
// so the agent can stay private and the API key never leaves the server.
import { existsSync, readFileSync } from "node:fs";

function agentId(): string | null {
  if (process.env.VOICE_AGENT_ID) return process.env.VOICE_AGENT_ID;
  const file = new URL("../../data/voice-agent.json", import.meta.url);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).agentId ?? null) : null;
}

export async function voiceToken(): Promise<{ token: string }> {
  const id = agentId();
  if (!id) throw new Error("Agent głosowy nie jest jeszcze utworzony — uruchom npm run voice:push");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Brak ELEVENLABS_API_KEY");
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(id)}`, { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { token: ((await res.json()) as { token: string }).token };
}
