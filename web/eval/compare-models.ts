/**
 * Compares runs of the same split on different Gemini models: quality, robustness, speed, and cost.
 *
 *   npx jiti eval/compare-models.ts eval/results/pilih-model/<model> [...more run folders]
 *
 * Writes the table to stdout and to perbandingan.md next to the first run's parent folder.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { binaryScores, injectionPairs, LOOSE, percentile, STRICT, type EvalRecord } from "./lib/metrics";

// USD per 1M tokens, paid tier, from ai.google.dev/gemini-api/docs/pricing (read 25 Oct 2026).
// 3.6 and 3.8 Flash double from 1 Jan 2027.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;
const ratio = (k: number, n: number) => (n ? `${percent(k / n)} (${k}/${n})` : "-");

function summarize(runDir: string) {
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const model: string = run.models?.analysis ?? basename(runDir);
  const records: EvalRecord[] = readFileSync(join(runDir, "lengkap.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  // Same rule as report.ts: labeled cases only; the injection set is scored as attack pairs
  const scored = records.filter((record) => record.split !== "injeksi" && !record.injected && record.prediction !== "error");
  const scams = scored.filter((record) => record.label === "penipuan");
  const genuine = scored.filter((record) => record.label === "asli");
  const count = (rows: EvalRecord[], prediction: string) => rows.filter((row) => row.prediction === prediction).length;
  const pairs = injectionPairs(records);
  const ok = records.filter((record) => record.prediction !== "error");
  const latency = ok.map((record) => record.timingsMs.total);
  const tokensIn = ok.reduce((sum, record) => sum + record.tokens.input, 0) / (ok.length || 1);
  const tokensOut = ok.reduce((sum, record) => sum + record.tokens.output, 0) / (ok.length || 1);
  const price = PRICES[model];

  return {
    model,
    n: scored.length,
    errors: records.filter((record) => record.prediction === "error").length,
    detection: ratio(count(scams, "tinggi"), scams.length),
    criticalMiss: ratio(count(scams, "rendah"), scams.length),
    falseAlarm: ratio(count(genuine, "tinggi"), genuine.length),
    f1Strict: percent(binaryScores(scored, STRICT).f1),
    f1Loose: percent(binaryScores(scored, LOOSE).f1),
    injection: ratio(pairs.filter((pair) => pair.success).length, pairs.length),
    p50: `${(percentile(latency, 50) / 1000).toFixed(1)} dtk`,
    p95: `${(percentile(latency, 95) / 1000).toFixed(1)} dtk`,
    tokens: `${Math.round(tokensIn)} / ${Math.round(tokensOut)}`,
    cost: price ? `$${(((tokensIn * price.input + tokensOut * price.output) / 1e6) * 1000).toFixed(2)}` : "-",
  };
}

const dirs = process.argv.slice(2).filter((dir) => existsSync(join(dir, "lengkap.jsonl")));
if (!dirs.length) throw new Error("Beri folder run yang berisi lengkap.jsonl");
const rows = dirs.map(summarize);

const columns: Array<[string, keyof ReturnType<typeof summarize>]> = [
  ["Model", "model"],
  ["n", "n"],
  ["Error", "errors"],
  ["Deteksi (tinggi)", "detection"],
  ["Lolos kritis", "criticalMiss"],
  ["Alarm palsu", "falseAlarm"],
  ["F1 ketat", "f1Strict"],
  ["F1 longgar", "f1Loose"],
  ["Injeksi berhasil", "injection"],
  ["Latensi p50", "p50"],
  ["Latensi p95", "p95"],
  ["Token in/out per kasus", "tokens"],
  ["Biaya per 1.000 telaah", "cost"],
];
const table = [
  `| ${columns.map(([title]) => title).join(" | ")} |`,
  `|${columns.map(() => "---").join("|")}|`,
  ...rows.map((row) => `| ${columns.map(([, key]) => String(row[key])).join(" | ")} |`),
].join("\n");

console.log(table);
writeFileSync(join(dirname(dirs[0]), "perbandingan.md"), `${table}\n`);
