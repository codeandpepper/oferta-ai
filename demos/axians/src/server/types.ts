/** Device types come from data/seed/devices.json — swapping the domain must not require code changes. */
export type DeviceType = string;

export interface Device {
  id: string;
  type: DeviceType;
  manufacturer: string;
  model: string;
  serial: string;
  client: string;
  location: string;
  installedAt: string;
  docId: string | null;
  /** Device location — used for local weather. */
  lat: number;
  lon: number;
}

export interface Ticket {
  id: string;
  deviceId: string;
  openedAt: string; // ISO date
  closedAt: string;
  technician: string;
  /** Category used for statistics (e.g. "nie_uruchamia_sie"). */
  category: string;
  symptom: string;
  /** Free-text technician note — messy on purpose. */
  note: string;
  cause: string;
  actions: string;
  partsUsed: string[];
  repairMinutes: number;
  priority: "niski" | "normalny" | "wysoki" | "krytyczny";
  status: "zamknięte" | "otwarte";
  nextServiceAt?: string;
  /** Set for tickets created during the demo (knowledge loop). */
  isNew?: boolean;
}

export interface Doc {
  id: string;
  title: string;
  deviceType: DeviceType;
  models: string[];
  file: string;
  sourceUrl: string;
  retrievedAt: string;
  /** Short descriptions of key pages (e.g. the troubleshooting table), indexed with the page text. */
  pageHints?: Record<string, string>;
}

export interface DocChunk {
  id: string;
  docId: string;
  page: number;
  text: string;
}

export interface Part {
  id: string;
  partNo: string;
  name: string;
  deviceType: DeviceType;
  fits: string[];
  replaces: string;
  stock: number;
  note: string;
}
