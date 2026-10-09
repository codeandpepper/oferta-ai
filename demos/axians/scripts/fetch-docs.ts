// Downloads the manufacturer manuals listed in data/seed/docs.json into public/docs/.
// They are not committed (public repo, third-party documents).
// Run: npm run seed:fetch-docs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const docs: { id: string; file: string; sourceUrl: string }[] = JSON.parse(readFileSync("data/seed/docs.json", "utf8"));
mkdirSync("public/docs", { recursive: true });
for (const d of docs) {
  const target = "public" + d.file;
  if (existsSync(target)) { console.log(`ok       ${target}`); continue; }
  const res = await fetch(d.sourceUrl);
  if (!res.ok) throw new Error(`${d.id}: HTTP ${res.status} ${d.sourceUrl}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log(`fetched  ${target}`);
}
