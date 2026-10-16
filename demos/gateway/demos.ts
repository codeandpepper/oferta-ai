// Discovers demos: every `demos/<name>/demo.json` is one demo served under `/<name>/`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Demo {
  name: string; // folder name = URL prefix
  dir: string;
  title: string;
  description?: string;
  start: string; // shell command, run in `dir`; the demo must listen on $PORT
  build?: string; // shell command, run in `dir` during the Heroku build
  check?: string; // shell command, run locally by the deploy script before pushing
}

export const ROOT = resolve(import.meta.dirname, "..");
const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function loadDemos(): Demo[] {
  const demos = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "demo.json")))
    .map((e) => {
      if (!NAME.test(e.name)) throw new Error(`Nazwa folderu demo „${e.name}” musi być kebab-case (a-z, 0-9, -)`);
      const cfg = JSON.parse(readFileSync(join(ROOT, e.name, "demo.json"), "utf8"));
      if (typeof cfg.start !== "string") throw new Error(`${e.name}/demo.json: brak pola "start"`);
      return { name: e.name, dir: join(ROOT, e.name), title: cfg.title ?? e.name, ...cfg } as Demo;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  // AXIANS_ would also match AXIANS_V2_KEY, so no demo's prefix may start another one.
  for (const a of demos) for (const b of demos)
    if (a !== b && envPrefix(b.name).startsWith(envPrefix(a.name)))
      throw new Error(`Nazwy demo „${a.name}” i „${b.name}” kolidują w prefiksie zmiennych (${envPrefix(a.name)}) — zmień jedną`);
  return demos;
}

/** Config var prefix of a demo: `orlen-x` → `ORLEN_X_`. */
export const envPrefix = (name: string) => name.toUpperCase().replace(/-/g, "_") + "_";

/**
 * Env for one demo's process: everything from the gateway, minus other demos' prefixed vars,
 * plus this demo's prefixed vars with the prefix stripped (`AXIANS_DEMO_PASSWORD` → `DEMO_PASSWORD`).
 * Unprefixed vars are shared by all demos.
 */
export function demoEnv(demo: Demo, all: Demo[], base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const others = all.filter((d) => d.name !== demo.name).map((d) => envPrefix(d.name));
  const own = envPrefix(demo.name);
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if (!others.some((p) => k.startsWith(p)) && !k.startsWith(own)) env[k] = v;
  for (const [k, v] of Object.entries(base)) if (k.startsWith(own) && k.length > own.length) env[k.slice(own.length)] = v;
  return env;
}
