// Writes each sampled case's input (text + attachments under neutral names) to a folder outside the
// repo, so the Sonnet runs see only the material, never the id, label, or dataset.
//   npx jiti eval/comparison/prepare-cases.ts <outDir>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { loadDataset } from "../lib/dataset";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: prepare-cases.ts <outDir>");
const sample = JSON.parse(readFileSync("eval/comparison/sample.json", "utf8")) as { cases: Array<{ case: string; id: string }> };
const { rows } = loadDataset("eval/dataset/dataset.csv", "eval/dataset/images");
const byId = new Map(rows.map((row) => [row.id, row]));

for (const { case: name, id } of sample.cases) {
  const row = byId.get(id);
  if (!row || row.split === "test") throw new Error(`${id} missing or in test`);
  const dir = join(outDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "input.txt"), row.text);
  const files = row.imageFiles.map((file, i) => {
    const target = `lampiran-${i + 1}${extname(file).toLowerCase()}`;
    copyFileSync(join("eval/dataset/images", file), join(dir, target));
    return target;
  });
  console.log(name, id, row.text.length, "chars", files.join(","));
}
