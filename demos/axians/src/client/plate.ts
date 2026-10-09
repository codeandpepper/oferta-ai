// Fallback when there's no camera: render a nameplate for a device as a PNG
// (Claude reads it exactly like a photo).
import type { Device } from "./api.ts";

export async function samplePlate(d: Device): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 720; c.height = 420;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 720, 420);
  grad.addColorStop(0, "#c9ccd1"); grad.addColorStop(1, "#9ea3aa");
  g.fillStyle = grad; g.fillRect(0, 0, 720, 420);
  g.strokeStyle = "#555"; g.lineWidth = 6; g.strokeRect(14, 14, 692, 392);
  for (const [x, y] of [[36, 36], [684, 36], [36, 384], [684, 384]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = "#777"; g.fill(); }
  g.fillStyle = "#1d1d1f";
  g.font = "bold 46px Arial"; g.fillText(d.manufacturer.replace(" (fikc.)", ""), 60, 92);
  g.font = "26px Arial";
  const rows: [string, string][] = d.type === "agregat"
    ? [["Typ / Model", d.model], ["Nr seryjny", d.serial], ["Moc znam.", d.model.includes("15540") ? "13,5 kVA" : "8,5 kVA"], ["Napięcie", "400/230 V  50 Hz"], ["Rok prod.", d.installedAt.slice(0, 4)]]
    : d.type === "pompa"
      ? [["Model", d.model], ["Serial No.", d.serial], ["P1", "30-1450 W"], ["U", "1x230 V 50/60 Hz"], ["PN", "PN 6/10"]]
      : [["Typ", d.model], ["Nr fabr.", d.serial], ["Moc", d.model.split(" ")[1].split("/")[0] + " kVA"], ["Napięcie", "15 / 0,42 kV"], ["Rok", d.installedAt.slice(0, 4)]];
  rows.forEach(([k, v], i) => {
    g.fillStyle = "#333"; g.fillText(k + ":", 60, 160 + i * 50);
    g.fillStyle = "#000"; g.font = "bold 28px 'Courier New'"; g.fillText(v, 270, 160 + i * 50); g.font = "26px Arial";
  });
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}
