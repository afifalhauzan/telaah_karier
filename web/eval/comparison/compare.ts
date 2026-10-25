// Compares the app's eval records with the Sonnet-with-skill outputs on the sample in sample.json.
// Metric definitions follow eval/lib/metrics.ts (docs/wiki/ai/05-DATASET-EVALUASI.md bagian 6).
//   npx jiti eval/comparison/compare.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataset } from "../lib/dataset";
import { classificationSummary, injectionPairs, type EvalRecord, type Prediction } from "../lib/metrics";

const DIR = "eval/comparison";
const sample = JSON.parse(readFileSync(join(DIR, "sample.json"), "utf8")) as {
  cases: Array<{ case: string; id: string; split: string; label: "penipuan" | "asli"; group: string }>;
};

// App runs per id, newest engine first; the first one listed is the run scored in the main table.
const APP_RUNS = ["eval/results/dev-pencarian-nama", `${DIR}/app-run-1`, `${DIR}/app-run-2`, "eval/results/dev-ulang-1", "eval/results/dev-ulang-2"];
const appRecords = new Map<string, EvalRecord[]>();
for (const run of APP_RUNS) {
  for (const line of readFileSync(join(run, "lengkap.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const record = JSON.parse(line) as EvalRecord;
    appRecords.set(record.id, [...(appRecords.get(record.id) ?? []), record]);
  }
}

interface SonnetRun {
  case: string;
  id: string;
  run: number;
  durationMs: number;
  totalTokens: number;
  toolUses: number;
  output: {
    informationSufficient?: boolean;
    riskAssessment?: { riskLevel?: string };
    risks?: Array<{ type: string; evidence?: string }>;
    summarySources?: Array<{ url: string }>;
  };
}
// sonnet/<case>-r<n>.json is the subagent's raw JSON; usage.json holds its time and tokens.
const usage = JSON.parse(readFileSync(join(DIR, "sonnet", "usage.json"), "utf8")) as Record<string, Omit<SonnetRun, "case" | "id" | "run" | "output">>;
const sonnetRuns = (name: string): SonnetRun[] =>
  [1, 2].flatMap((run) => {
    const file = join(DIR, "sonnet", `${name}-r${run}.json`);
    if (!existsSync(file)) return [];
    const output = JSON.parse(readFileSync(file, "utf8")) as SonnetRun["output"];
    return [{ case: name, id: "", run, output, ...usage[`${name}-r${run}`] }];
  });
const sonnetPrediction = ({ output }: SonnetRun): Prediction => {
  const level = output.riskAssessment?.riskLevel;
  if (output.informationSufficient === false) return "tanpa_verdict";
  return level === "rendah" || level === "sedang" || level === "tinggi" ? level : "error";
};

const { rows } = loadDataset("eval/dataset/dataset.csv", "eval/dataset/images");
const textOf = new Map(rows.map((row) => [row.id, row.text]));
const hasImage = new Map(rows.map((row) => [row.id, row.imageFiles.length > 0]));

// Exact substring after collapsing whitespace and case; quotes from attachments cannot be checked this way.
const norm = (value: string) => value.replace(/^["“'”]+|["”'“]+$/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Sonnet records shaped like the app's, so the same metric functions score both.
const asRecord = (c: (typeof sample.cases)[number], prediction: Prediction): EvalRecord => {
  const row = rows.find((r) => r.id === c.id)!;
  return {
    id: c.id, split: c.split, label: c.label, modus: row.modus, hardCaseTags: row.hardCaseTags, inputType: row.inputType,
    pairId: row.pairId, injected: c.split === "injeksi", variant: "sonnet", prediction, riskTypes: [], signals: [],
    sourceCount: 0, riskFloorApplied: false, droppedSourceIds: 0, droppedEvidence: 0,
    timingsMs: { total: 0, llm: 0, search: 0, extraction: 0 }, tokens: { input: 0, output: 0 },
  };
};

const appMain: EvalRecord[] = [];
const sonnetMain: EvalRecord[] = [];
const lines: string[] = [];
const quotes = { checked: 0, found: 0, imageOnly: 0, missing: [] as string[] };
const consistency = { app: [] as string[], sonnet: [] as string[] };

for (const c of sample.cases) {
  const app = appRecords.get(c.id) ?? [];
  const sonnet = sonnetRuns(c.case);
  if (app[0]) appMain.push(app[0]);
  if (sonnet[0]) sonnetMain.push(asRecord(c, sonnetPrediction(sonnet[0])));
  if (app.length > 1) consistency.app.push(`${c.id}: ${app.map((r) => r.prediction).join("/")}`);
  if (sonnet.length > 1) consistency.sonnet.push(`${c.id}: ${sonnet.map(sonnetPrediction).join("/")}`);

  for (const run of sonnet) {
    for (const risk of run.output.risks ?? []) {
      if (!risk.evidence?.trim()) continue;
      const inText = norm(textOf.get(c.id) ?? "").includes(norm(risk.evidence));
      if (inText) {
        quotes.checked++;
        quotes.found++;
      } else if (hasImage.get(c.id)) {
        quotes.imageOnly++;
      } else {
        quotes.checked++;
        quotes.missing.push(`${c.id} r${run.run}: "${risk.evidence}"`);
      }
    }
  }

  const s = sonnet[0];
  lines.push(
    [c.case, c.id, c.group, c.label, app.map((r) => r.prediction).join("/") || "-", sonnet.map(sonnetPrediction).join("/") || "-",
      app[0] ? (app[0].timingsMs.total / 1000).toFixed(1) : "-", s ? (s.durationMs / 1000).toFixed(0) : "-",
      app[0] ? app[0].tokens.input + app[0].tokens.output : "-", s?.totalTokens ?? "-", s?.toolUses ?? "-",
      app[0]?.droppedEvidence ?? "-", (s?.output.summarySources ?? []).length].join(" | ")
  );
}

console.log("case | id | grup | label | app | sonnet | app dtk | sonnet dtk | app token | sonnet token | sonnet tool | app droppedEvidence | sonnet sumber");
lines.forEach((line) => console.log(line));

const fmt = (r: { k: number; n: number; value: number; ci: [number, number] }) =>
  `${r.k}/${r.n} (${(r.value * 100).toFixed(0)}%, CI ${(r.ci[0] * 100).toFixed(0)}–${(r.ci[1] * 100).toFixed(0)}%)`;
for (const [name, records] of [["app", appMain], ["sonnet", sonnetMain]] as const) {
  const summary = classificationSummary(records);
  const clean = records.filter((r) => !r.injected);
  const strictCorrect = clean.filter((r) => (r.label === "penipuan") === (r.prediction === "tinggi")).length;
  console.log(`\n== ${name}: n=${summary.n}, akurasi biner ketat ${strictCorrect}/${clean.length}, deteksi ${fmt(summary.detection)}, lolos kritis ${fmt(summary.criticalMiss)}, alarm palsu ${fmt(summary.falseAlarm)}, tanpa verdict ${summary.noVerdict.k}`);
  console.log(`   ketat P/R/F1 ${summary.strict.precision.toFixed(2)}/${summary.strict.recall.toFixed(2)}/${summary.strict.f1.toFixed(2)}, longgar P/R/F1 ${summary.loose.precision.toFixed(2)}/${summary.loose.recall.toFixed(2)}/${summary.loose.f1.toFixed(2)}`);
  console.log(`   confusion ${JSON.stringify(summary.confusion)}`);
  for (const pair of injectionPairs(records)) console.log(`   injeksi ${pair.id} (bersih ${pair.cleanId}, ${pair.label}): ${pair.clean} -> ${pair.injected}${pair.success ? " SERANGAN BERHASIL" : ""}`);
}

console.log(`\nKonsistensi app: ${consistency.app.join("; ")}`);
console.log(`Konsistensi sonnet: ${consistency.sonnet.join("; ")}`);
console.log(`\nKutipan Sonnet: ${quotes.found}/${quotes.checked} ada persis di teks; ${quotes.imageOnly} kutipan dari lampiran (tidak bisa dicek substring)`);
quotes.missing.forEach((item) => console.log(`  TIDAK ADA: ${item}`));
const appDropped = appMain.reduce((sum, r) => sum + r.droppedEvidence, 0);
console.log(`App droppedEvidence (kutipan model yang dibuang pengaman): ${appDropped} di ${appMain.length} kasus`);
