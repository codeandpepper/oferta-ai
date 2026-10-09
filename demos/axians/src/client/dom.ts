// Tiny DOM helpers — no framework on purpose.
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
export function errorBox(e: unknown) {
  return h("div", { class: "error" }, "⚠ ", e instanceof Error ? e.message : String(e));
}

/** Explainer shown under a UI element: what the input is for and which AI feature backs it. Hidden via the header toggle. */
export function hint(what: string, ai?: string) {
  return h("div", { class: "hint" },
    h("div", {}, h("span", { class: "hint-icon", "aria-hidden": "true" }, "ⓘ"), what),
    ai ? h("div", { class: "hint-ai" }, h("span", { class: "ai-tag" }, "AI"), ai) : null,
  );
}
