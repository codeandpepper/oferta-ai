// Heroku build step (`npm run build` in demos/): runs every demo's own `build` command in its folder.
// Usage: node gateway/build.ts [name ...]   (no names = all demos)
import { execSync } from "node:child_process";
import { loadDemos } from "./demos.ts";

const only = process.argv.slice(2);
const demos = loadDemos().filter((d) => d.build && (only.length === 0 || only.includes(d.name)));

for (const d of demos) {
  console.log(`\n▸ build ${d.name}: ${d.build}`);
  const t = Date.now();
  execSync(d.build!, { cwd: d.dir, stdio: "inherit", env: { ...process.env, BASE_PATH: `/${d.name}` } });
  console.log(`  ✓ ${d.name} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
}
