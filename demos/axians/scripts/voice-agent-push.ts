// Pushes the voice agent (agent_configs/technik-voice.json) and its client tools
// (tool_configs/*.json) to ElevenLabs. Idempotent: creates on first run, updates afterwards.
// IDs are kept in data/voice-agent.json (not secret).
// Needs ELEVENLABS_API_KEY with Agents (convai) write permission.
// Run: npm run voice:push
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const BASE = "https://api.elevenlabs.io/v1";
const API = `${BASE}/convai`;
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("Brak ELEVENLABS_API_KEY w .env");
const STATE = "data/voice-agent.json";
const state: { agentId?: string; tools: Record<string, string>; pronunciation?: { id: string; versionId: string } } = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { tools: {} };

async function call(method: string, path: string, body: unknown, base = API) {
  const res = await fetch(base + path, { method, headers: { "xi-api-key": key!, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

for (const file of readdirSync("tool_configs").filter((f) => f.endsWith(".json")).sort()) {
  const tool_config = JSON.parse(readFileSync(`tool_configs/${file}`, "utf8"));
  const id = state.tools[tool_config.name];
  if (id) {
    await call("PATCH", `/tools/${id}`, { tool_config });
    console.log(`update tool  ${tool_config.name} (${id})`);
  } else {
    const r = await call("POST", "/tools", { tool_config });
    state.tools[tool_config.name] = r.id;
    console.log(`create tool  ${tool_config.name} (${r.id})`);
  }
}

// Pronunciation dictionary (device IDs, model names, abbreviations) — alias rules work with every TTS model.
// Optional: needs the "Pronunciation dictionaries: write" permission; without it the agent is pushed without it.
const dict = JSON.parse(readFileSync("agent_configs/pronunciation-pl.json", "utf8"));
try {
  if (state.pronunciation) {
    const r = await call("POST", `/pronunciation-dictionaries/${state.pronunciation.id}/set-rules`, { rules: dict.rules }, BASE);
    state.pronunciation.versionId = r.version_id;
    console.log(`update dict  ${dict.name} (${state.pronunciation.id}, ${dict.rules.length} reguł)`);
  } else {
    const r = await call("POST", "/pronunciation-dictionaries/add-from-rules", dict, BASE);
    state.pronunciation = { id: r.id, versionId: r.version_id };
    console.log(`create dict  ${dict.name} (${r.id}, ${dict.rules.length} reguł)`);
  }
} catch (e) {
  if (!String(e).includes("missing_permissions")) throw e;
  console.warn("pomijam słownik wymowy — klucz nie ma uprawnienia „Pronunciation dictionaries: write”");
}

const agent = JSON.parse(readFileSync("agent_configs/technik-voice.json", "utf8"));
agent.conversation_config.tts.pronunciation_dictionary_locators = state.pronunciation
  ? [{ pronunciation_dictionary_id: state.pronunciation.id, version_id: state.pronunciation.versionId }]
  : [];
agent.conversation_config.agent.prompt.tool_ids = Object.values(state.tools);
if (state.agentId) {
  await call("PATCH", `/agents/${state.agentId}`, agent);
  console.log(`update agent ${agent.name} (${state.agentId})`);
} else {
  const r = await call("POST", "/agents/create", agent);
  state.agentId = r.agent_id;
  console.log(`create agent ${agent.name} (${r.agent_id})`);
}
writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
console.log(`\nZapisano ${STATE}. Agent gotowy w zakładce „Technik — voice agent”.`);
