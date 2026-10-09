// One-off feasibility check: Cursor SDK agent + one real custom tool, timed.
import { Agent } from "@cursor/sdk";
import { initStore } from "../src/server/store.ts";
import { deviceHistory } from "../src/server/sources/tickets-query.ts";
initStore();

const t0 = Date.now();
const agent = await Agent.create({
  apiKey: process.env.ANTHROPIC_API_KEY!, // crsr_ key currently stored here
  model: { id: "claude-sonnet-5-5", params: [{ id: "reasoning_effort", value: "low" }] },
  tools: ["mcp"], // custom tools only: no shell, no file access
  local: {
    cwd: process.argv[2],
    settingSources: [],
    customTools: {
      device_history: {
        description: "Ostatnie zgłoszenia serwisowe danego egzemplarza urządzenia (najnowsze pierwsze).",
        inputSchema: { type: "object", properties: { deviceId: { type: "string" } }, required: ["deviceId"] },
        async execute({ deviceId }: { deviceId: string }) {
          console.log(`  [tool] device_history(${deviceId}) after ${Date.now() - t0} ms`);
          return deviceHistory({ deviceId }).slice(0, 3);
        },
      },
    },
  },
} as never);
const t1 = Date.now();
const run = await agent.send('Kiedy był ostatni serwis urządzenia AG-003 i co zalecił technik? Użyj narzędzia device_history. Odpowiedz WYŁĄCZNIE JSON-em: {"date":"YYYY-MM-DD","recommendation":"..."}');
const result = await run.wait();
const t2 = Date.now();
console.log("create ms:", t1 - t0, "| send→done ms:", t2 - t1, "| status:", result.status);
console.log("result:", result.result);
console.log("tokens:", result.usage?.totalTokens);
await agent[Symbol.asyncDispose]();
