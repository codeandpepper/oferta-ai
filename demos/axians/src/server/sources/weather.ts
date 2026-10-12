// Weather for the last 7 days at the device (or the technician's GPS position).
// Open-Meteo: free, no API key (data CC BY 4.0 — attributed in the UI).
// "Demo" mode returns a fixed rainy week so the live scenario is predictable.

export interface WeatherQuery {
  lat: number;
  lon: number;
  label: string;
  demo: boolean;
}

export interface WeatherDay {
  date: string;
  precipitationMm: number;
  tMin: number;
  tMax: number;
  humidity: number;
  gustKmh: number;
}

export interface Weather {
  label: string;
  lat: number;
  lon: number;
  demo: boolean;
  days: WeatherDay[];
  summary: {
    precipitationMm: number;
    rainyDays: number;
    lastRain: string | null;
    tMin: number;
    tMax: number;
    frostDays: number;
    avgHumidity: number;
    maxGustKmh: number;
  };
  source: string;
}

const cache = new Map<string, { at: number; days: WeatherDay[] }>();
const TTL = 30 * 60 * 1000;

function lastDates(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  return out;
}

// Rainy week ending today: heavy rain two days ago and yesterday, damp and cool.
const DEMO_PATTERN: Omit<WeatherDay, "date">[] = [
  { precipitationMm: 0.0, tMin: 9, tMax: 17, humidity: 71, gustKmh: 24 },
  { precipitationMm: 1.2, tMin: 8, tMax: 15, humidity: 80, gustKmh: 31 },
  { precipitationMm: 0.4, tMin: 7, tMax: 14, humidity: 83, gustKmh: 28 },
  { precipitationMm: 6.8, tMin: 8, tMax: 12, humidity: 92, gustKmh: 47 },
  { precipitationMm: 14.6, tMin: 7, tMax: 10, humidity: 96, gustKmh: 58 },
  { precipitationMm: 9.3, tMin: 6, tMax: 10, humidity: 95, gustKmh: 42 },
  { precipitationMm: 0.6, tMin: 5, tMax: 11, humidity: 90, gustKmh: 22 },
];

async function fetchDays(lat: number, lon: number): Promise<WeatherDay[]> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.days;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    past_days: "6",
    forecast_days: "1",
    daily: "precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_gusts_10m_max",
    timezone: "Europe/Warsaw",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Pogoda niedostępna (HTTP ${res.status})`);
  const j = (await res.json()) as { daily: Record<string, (number | string | null)[]> };
  const d = j.daily;
  const days = (d.time as string[]).map((date, i) => ({
    date,
    precipitationMm: Number(d.precipitation_sum[i] ?? 0),
    tMin: Number(d.temperature_2m_min[i] ?? 0),
    tMax: Number(d.temperature_2m_max[i] ?? 0),
    humidity: Number(d.relative_humidity_2m_mean[i] ?? 0),
    gustKmh: Number(d.wind_gusts_10m_max[i] ?? 0),
  }));
  cache.set(key, { at: Date.now(), days });
  return days;
}

export async function getWeather(q: WeatherQuery): Promise<Weather> {
  const days = q.demo
    ? lastDates(7).map((date, i) => ({ date, ...DEMO_PATTERN[i] }))
    : await fetchDays(q.lat, q.lon);
  const round = (n: number) => Math.round(n * 10) / 10;
  const rainy = days.filter((d) => d.precipitationMm >= 1);
  return {
    label: q.label,
    lat: q.lat,
    lon: q.lon,
    demo: q.demo,
    days,
    summary: {
      precipitationMm: round(days.reduce((s, d) => s + d.precipitationMm, 0)),
      rainyDays: rainy.length,
      lastRain: rainy.at(-1)?.date ?? null,
      tMin: Math.min(...days.map((d) => d.tMin)),
      tMax: Math.max(...days.map((d) => d.tMax)),
      frostDays: days.filter((d) => d.tMin <= 0).length,
      avgHumidity: Math.round(days.reduce((s, d) => s + d.humidity, 0) / days.length),
      maxGustKmh: Math.max(...days.map((d) => d.gustKmh)),
    },
    source: q.demo ? "Dane demonstracyjne (zapisany deszczowy tydzień)" : "Open-Meteo.com (CC BY 4.0)",
  };
}
