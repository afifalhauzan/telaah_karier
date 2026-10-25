/**
 * Runs the analyzer over the labeled dataset and writes one JSONL line per case and variant.
 *
 *   pnpm eval --split dev
 *   pnpm eval --split dev --variants ablation
 *   pnpm eval --split dev --env GEMINI_ANALYSIS_MODEL=gemini-2.5-flash-lite
 *   pnpm eval --split test --final            (only for the single final run)
 *   pnpm eval --resume eval/results/<run>      (continue an interrupted run)
 *   pnpm eval --dataset eval/dataset/v2/dataset.csv --images eval/dataset/v2/images --split test --kb-before 2026-06-12
 *                                              (the time-split set: knowledge base only from before the test cases)
 *
 * See docs/wiki/ai/05-DATASET-EVALUASI.md for the dataset format and the metric protocol.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isInjectedVariant, loadAttachments, loadDataset, selectRows, SPLITS, type DatasetRow, type Split } from "./lib/dataset";
import type { EvalRecord, Prediction } from "./lib/metrics";
import { ABLATION_VARIANTS, VARIANTS } from "./lib/variants";

const STAGES = ["extraction", "analysis"] as const;
// A knowledge base case this similar to a dataset row is the same posting (calibrated on dev)
const KNOWLEDGE_EXCLUDE_ABOVE = 0.9;

interface RunConfig {
  startedAt: string;
  commit: string;
  uncommittedChanges: boolean;
  dataset: { path: string; sha256: string };
  splits: Split[];
  variants: string[];
  models: Record<string, string>;
  envOverrides: string[];
  // Knowledge base cutoff, when the test cases are the newest fact-checks (time split)
  kbBefore?: string;
  caseCount: number;
}

function parseArgs(argv: string[]) {
  const args = {
    dataset: "eval/dataset/dataset.csv",
    images: "",
    splits: ["dev"] as Split[],
    variants: ["lengkap"],
    ids: [] as string[],
    limit: Infinity,
    concurrency: 2,
    env: [] as string[],
    out: "",
    resume: "",
    final: false,
    kbBefore: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${flag} butuh nilai`);
      return next;
    };
    switch (flag) {
      case "--dataset": args.dataset = value(); break;
      case "--images": args.images = value(); break;
      case "--split": args.splits = value().split(",") as Split[]; break;
      case "--variants": {
        const list = value();
        args.variants = list === "ablation" ? ABLATION_VARIANTS : list === "all" ? Object.keys(VARIANTS) : list.split(",");
        break;
      }
      case "--ids": args.ids = value().split(","); break;
      case "--limit": args.limit = Number(value()); break;
      case "--concurrency": args.concurrency = Math.max(1, Number(value())); break;
      case "--env": args.env.push(value()); break;
      case "--out": args.out = value(); break;
      case "--resume": args.resume = value(); break;
      case "--final": args.final = true; break;
      case "--kb-before": {
        args.kbBefore = value();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(args.kbBefore)) throw new Error("--kb-before butuh tanggal YYYY-MM-DD");
        break;
      }
      default: throw new Error(`argumen tidak dikenal: ${flag}`);
    }
  }
  return args;
}

/** Loads KEY=VALUE lines without overriding variables that are already set. */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function predictionOf(claims: Array<{ riskLevel?: string }>): Prediction {
  const level = claims[0]?.riskLevel;
  return level === "rendah" || level === "sedang" || level === "tinggi" ? level : "tanpa_verdict";
}

function baseRecord(row: DatasetRow, variant: string): Omit<EvalRecord, "prediction"> {
  return {
    id: row.id,
    split: row.split,
    label: row.label,
    modus: row.modus,
    hardCaseTags: row.hardCaseTags,
    inputType: row.inputType,
    pairId: row.pairId,
    visibleEvidence: row.visibleEvidence,
    injected: isInjectedVariant(row),
    variant,
    riskTypes: [],
    signals: [],
    sourceCount: 0,
    riskFloorApplied: false,
    droppedSourceIds: 0,
    droppedEvidence: 0,
    timingsMs: { total: 0, llm: 0, search: 0, extraction: 0 },
    tokens: { input: 0, output: 0 },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  loadEnvFile(".env.local");
  loadEnvFile(".env");
  for (const pair of args.env) {
    const [key, ...rest] = pair.split("=");
    process.env[key] = rest.join("=");
  }

  // Resuming reuses the original settings so the continued run measures the same thing.
  const outDir = resolve(args.resume || args.out || join("eval/results", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)));
  let previous: RunConfig | null = null;
  if (args.resume) {
    previous = JSON.parse(readFileSync(join(outDir, "run.json"), "utf8")) as RunConfig;
    args.dataset = previous.dataset.path;
    args.splits = previous.splits;
    args.variants = previous.variants;
    for (const pair of previous.envOverrides) {
      const [key, ...rest] = pair.split("=");
      process.env[key] = rest.join("=");
    }
  }

  const unknownSplits = args.splits.filter((split) => !SPLITS.includes(split));
  const unknownVariants = args.variants.filter((variant) => !VARIANTS[variant]);
  if (unknownSplits.length || unknownVariants.length) {
    throw new Error(`split/varian tidak dikenal: ${[...unknownSplits, ...unknownVariants].join(", ")}. Varian: ${Object.keys(VARIANTS).join(", ")}`);
  }
  if (args.splits.includes("test") && !args.final) {
    throw new Error("Set test hanya dijalankan sekali untuk evaluasi final. Tambahkan --final jika memang itu maksudnya.");
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn("PERINGATAN: GOOGLE_GENERATIVE_AI_API_KEY tidak ada; semua varian akan jatuh ke pemeriksaan aturan.");
  }

  const datasetPath = resolve(args.dataset);
  const imagesDir = resolve(args.images || join(dirname(datasetPath), "images"));
  const { rows, issues } = loadDataset(datasetPath, imagesDir);
  for (const issue of issues) {
    console.warn(`[dataset] ${issue.level === "error" ? "DILEWATI" : "catatan"} ${issue.id}: ${issue.message}`);
  }

  let cases = selectRows(rows, args.splits);
  if (args.ids.length) cases = cases.filter((row) => args.ids.includes(row.id));
  cases = cases.slice(0, args.limit);
  if (!cases.length) throw new Error("Tidak ada kasus yang bisa dijalankan.");

  // Imported after the env is loaded, so model and key lookups see the overrides.
  const { runAnalysis } = await import("../langchain/agents/analyzer/analyze");
  const { geminiModelFor } = await import("../langchain/agents/analyzer/llm");

  mkdirSync(outDir, { recursive: true });
  const config: RunConfig = previous ?? {
    startedAt: new Date().toISOString(),
    commit: git("rev-parse --short HEAD"),
    uncommittedChanges: Boolean(git("status --porcelain -- langchain")),
    dataset: { path: args.dataset, sha256: createHash("sha256").update(readFileSync(datasetPath)).digest("hex") },
    splits: args.splits,
    variants: args.variants,
    models: Object.fromEntries(STAGES.map((stage) => [stage, geminiModelFor(stage)])),
    envOverrides: args.env,
    ...(args.kbBefore ? { kbBefore: args.kbBefore } : {}),
    caseCount: cases.length,
  };
  if (previous && previous.dataset.sha256 !== createHash("sha256").update(readFileSync(datasetPath)).digest("hex")) {
    console.warn("PERINGATAN: dataset berubah sejak run ini dimulai.");
  }
  writeFileSync(join(outDir, "run.json"), JSON.stringify(config, null, 2));

  console.log(`Run ${outDir}`);
  console.log(`${cases.length} kasus × ${args.variants.length} varian, model ${JSON.stringify(config.models)}, commit ${config.commit}${config.uncommittedChanges ? " (+perubahan belum di-commit)" : ""}`);

  for (const variant of args.variants) {
    const file = join(outDir, `${variant}.jsonl`);
    const done = new Set(
      existsSync(file)
        ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => (JSON.parse(line) as EvalRecord).id)
        : []
    );
    const queue = cases.filter((row) => !done.has(row.id));
    console.log(`\n== ${variant}: ${VARIANTS[variant].description} (${queue.length} kasus${done.size ? `, ${done.size} sudah selesai` : ""})`);

    let finished = 0;
    const evaluate = async (row: DatasetRow) => {
      const base = baseRecord(row, variant);
      let record: EvalRecord;
      try {
        const { result, meta } = await runAnalysis(
          { input: row.text, images: loadAttachments(row, imagesDir) },
          // The row's own fact-check stays out of the knowledge base: by its URL, and by near-identical
          // text for a copy filed under another article
          // Fact-check sites never reach the web search: they would hand the agent its answer
          {
            ...VARIANTS[variant].options,
            excludeFactChecks: true,
            knowledge: {
              excludeUrls: row.labelSource ? [row.labelSource] : [],
              excludeAbove: KNOWLEDGE_EXCLUDE_ABOVE,
              ...(config.kbBefore ? { before: config.kbBefore } : {}),
            },
          }
        );
        record = {
          ...base,
          prediction: predictionOf(result.claims),
          confidence: result.claims[0]?.confidence,
          mode: meta.mode,
          riskTypes: result.risks.map((risk) => risk.type),
          signals: meta.signals.map((signal) => signal.id),
          searchStatus: meta.search.status,
          sourceCount: meta.search.sourceCount,
          extractionStatus: meta.extraction.status,
          riskFloorApplied: meta.riskFloorApplied,
          manipulationCapApplied: meta.manipulationCapApplied,
          droppedSourceIds: meta.droppedSourceIds,
          droppedEvidence: meta.droppedEvidence,
          timingsMs: { ...meta.timingsMs, extraction: meta.extraction.ms },
          tokens: {
            input: (meta.tokenUsage?.input ?? 0) + (meta.extraction.tokenUsage?.input ?? 0),
            output: (meta.tokenUsage?.output ?? 0) + (meta.extraction.tokenUsage?.output ?? 0),
          },
          fallbackReason: meta.fallbackReason,
          claim: result.claims[0]?.text,
        };
      } catch (error) {
        record = { ...base, prediction: "error", error: error instanceof Error ? error.message : String(error) };
      }

      appendFileSync(file, `${JSON.stringify(record)}\n`);
      finished++;
      const seconds = (record.timingsMs.total / 1000).toFixed(1);
      console.log(`[${finished}/${queue.length}] ${row.id} ${row.label} -> ${record.prediction} (${seconds} dtk${record.mode === "rule_fallback" && variant !== "aturan_saja" ? ", FALLBACK" : ""})`);
    };

    // A small worker pool: enough parallelism to finish quickly without tripping rate limits.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(args.concurrency, queue.length) }, async () => {
        while (next < queue.length) {
          await evaluate(queue[next++]);
        }
      })
    );
  }

  console.log(`\nSelesai. Laporan: pnpm eval:report ${outDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
