// Thin client for the demo API. Types mirror the server's JSON.
export interface Device { id: string; type: string; manufacturer: string; model: string; serial: string; client: string; location: string; installedAt: string; docId: string | null; lat: number; lon: number }
export interface WeatherOpts { lat?: number; lon?: number; label?: string; demo: boolean }
export interface Weather {
  label: string; demo: boolean; source: string;
  days: { date: string; precipitationMm: number; tMin: number; tMax: number; humidity: number; gustKmh: number }[];
  summary: { precipitationMm: number; rainyDays: number; lastRain: string | null; tMin: number; tMax: number; frostDays: number; avgHumidity: number; maxGustKmh: number };
}
export interface Ticket { id: string; deviceId: string; openedAt: string; category: string; symptom: string; note: string; cause: string; actions: string; repairMinutes: number; isNew?: boolean; nextServiceAt?: string }
export interface Ref { kind: "zgloszenie" | "dokumentacja" | "czesc" | "pogoda"; id: string; label: string; url?: string; detail: string; isNew?: boolean }
export interface Answer { summary: string; sections: { kind: "pogoda" | "historia_typ" | "historia_egzemplarz" | "dokumentacja" | "czesci"; title: string; text: string; refs: string[] }[]; steps: string[] }
export type AskEvent =
  | { type: "tool"; name: string; label: string; input: unknown; resultCount: number }
  | { type: "answer"; answer: Answer; refs: Record<string, Ref> }
  | { type: "error"; message: string };
export interface Protocol { symptom: string; category: string; cause: string; actions: string[]; partsUsed: { partNo: string | null; name: string; qty: number }[]; repairMinutes: number; priority: string; recommendations: string[]; nextServiceAt: string | null; missing: string[] }
export interface ManagerResult { query: unknown; chart: "bar" | "line" | "none"; title: string; valueLabel: string; rows: { label: string; value: number; tickets: number }[]; takeaway: string }

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) location.href = "/login";
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  devices: () => fetch("/api/devices").then((r) => json<Device[]>(r)),
  deviceTickets: (id: string) => fetch(`/api/devices/${id}/tickets`).then((r) => json<Ticket[]>(r)),
  stt: (audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "nagranie.webm");
    return fetch("/api/stt", { method: "POST", body: form }).then((r) => json<{ text: string }>(r));
  },
  identify: (image: Blob) => {
    const form = new FormData();
    form.append("image", image, "tabliczka.png");
    return fetch("/api/identify", { method: "POST", body: form }).then((r) =>
      json<{ plate: { manufacturer: string | null; model: string | null; serial: string | null; otherData: string[]; readable: boolean }; device: Device | null; matchedBy: string | null }>(r),
    );
  },
  protocol: (deviceId: string, note: string, context?: string) => post("/api/protocol", { deviceId, note, context }).then((r) => json<Protocol>(r)),
  saveTicket: (deviceId: string, note: string, protocol: Protocol) => post("/api/tickets", { deviceId, note, protocol }).then((r) => json<Ticket>(r)),
  weather: (deviceId: string, o: WeatherOpts) => {
    const q = new URLSearchParams({ deviceId, demo: o.demo ? "1" : "0" });
    if (o.lat !== undefined && o.lon !== undefined) { q.set("lat", String(o.lat)); q.set("lon", String(o.lon)); }
    if (o.label) q.set("label", o.label);
    return fetch(`/api/weather?${q}`).then((r) => json<Weather>(r));
  },
  manager: (question: string) => post("/api/manager", { question }).then((r) => json<ManagerResult>(r)),
  reset: () => post("/api/reset", {}).then((r) => json<{ tickets: number }>(r)),

  /** Server-sent events over a POST body. */
  async *ask(deviceId: string, question: string, weather?: WeatherOpts): AsyncGenerator<AskEvent> {
    const res = await post("/api/ask", { deviceId, question, weather });
    if (res.status === 401) location.href = "/login";
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += value;
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (data) yield JSON.parse(data) as AskEvent;
      }
    }
  },
};
