// Turns an assistant answer into one Markdown document: the verdict, what it rests on, and the
// sources. Copy, PDF and the WhatsApp/Telegram copies all start from this text.
// Relative imports on purpose: the tests run this with jiti, which does not read the "@/" alias.
import {
  AnalysisSchema,
  RISK_LEVEL_ADVICE,
  RISK_LEVEL_LABELS,
  RISK_TYPE_LABELS,
  splitClaim,
  type AnalysisResult,
  type RiskLevel,
} from "../../langchain/agents/analyzer/schema";

export interface ExportPart {
  type: string;
  [key: string]: any;
}

export interface SourceFile {
  mediaType: string;
  filename?: string;
  url: string;
}

export interface ExportOptions {
  /** What the user sent before this answer: the posting text, or the question for a plain answer. */
  sourceText?: string;
  sourceFiles?: SourceFile[];
  exportedAt?: Date;
}

export interface AnalysisExport {
  title: string;
  markdown: string;
  verdictLevel: RiskLevel | null;
  /** The files the markdown points at as attachment:N, in that order. */
  attachments: SourceFile[];
}

const CHECK_LABELS: Record<string, string> = {
  ok: "Tidak ada temuan",
  warning: "Ada temuan",
  info: "Informasi",
  skipped: "Tidak dapat diperiksa",
};

const DISCLAIMER =
  "Ini analisis risiko awal, bukan vonis final. Selalu verifikasi ke kanal resmi sebelum mendaftarkan diri.";

const MAX_SOURCE_TEXT = 1200;

function lastData(parts: ExportPart[], type: string): any {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].type === type && parts[i].data != null) return parts[i].data;
  }
  return undefined;
}

function readAnalysis(parts: ExportPart[]): AnalysisResult | null {
  const raw = lastData(parts, "data-analysis");
  if (!raw) return null;

  try {
    const result = AnalysisSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function nonEmpty<T>(items: T[] | undefined): T[] | undefined {
  return items && items.length > 0 ? items : undefined;
}

function quote(text: string): string {
  const trimmed = text.trim();
  const clipped = trimmed.length > MAX_SOURCE_TEXT ? `${trimmed.slice(0, MAX_SOURCE_TEXT).trimEnd()}…` : trimmed;
  return clipped
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * The document for one assistant answer, or null when there is nothing in it worth exporting
 * (e.g. an answer that only offers a choice).
 */
export function buildAnalysisExport(parts: ExportPart[], options: ExportOptions = {}): AnalysisExport | null {
  const analysis = readAnalysis(parts);

  // The streamed sections win; the final data-analysis part is the fallback for saved sessions
  const summaryData = lastData(parts, "data-summary");
  const summary: string = (typeof summaryData === "string" ? summaryData : summaryData?.text) ?? analysis?.summary ?? "";
  const claims = nonEmpty<{ text: string; riskLevel?: RiskLevel }>(lastData(parts, "data-claims") ?? analysis?.claims);
  const salary = lastData(parts, "data-salary-benefit") ?? analysis?.salaryBenefit;
  const risks = nonEmpty(lastData(parts, "data-risks") ?? analysis?.risks);
  const checks = nonEmpty(lastData(parts, "data-checks") ?? analysis?.checks);
  const explanations = nonEmpty(lastData(parts, "data-explanation") ?? analysis?.explanations);
  const references = nonEmpty(lastData(parts, "data-references") ?? analysis?.references);
  const actionInsight = lastData(parts, "data-action-insight");

  const hasAnalysis = !!(claims || summary.trim() || salary?.summary?.trim() || risks || explanations);
  const text = parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!hasAnalysis && !actionInsight?.points?.length && !text) return null;

  const kind = hasAnalysis ? "analysis" : actionInsight?.points?.length ? "action" : "answer";
  const title = kind === "analysis" ? "Hasil Telaah Lowongan" : kind === "action" ? actionInsight.title || "Telaah Lanjutan" : "Jawaban TelaahKarier";

  const exportedAt = options.exportedAt ?? new Date();
  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(exportedAt);

  const attachments = kind === "analysis" ? (options.sourceFiles ?? []).filter((file) => !!file.url) : [];
  const sections: string[] = [`# ${title}`, `Diekspor ${date}`];

  // What the answer is about. An action chip's label is not material, so it is left out.
  if (kind === "analysis" && (attachments.length > 0 || options.sourceText?.trim())) {
    const material: string[] = ["## Materi yang dianalisis"];
    attachments.forEach((file, index) => material.push(`![${file.filename ?? `Lampiran ${index + 1}`}](attachment:${index})`));
    if (options.sourceText?.trim()) material.push(quote(options.sourceText));
    sections.push(material.join("\n\n"));
  } else if (kind === "answer" && options.sourceText?.trim()) {
    sections.push(`## Pertanyaan\n\n${quote(options.sourceText)}`);
  }

  let verdictLevel: RiskLevel | null = null;

  if (claims) {
    const { level, reason } = splitClaim(claims[0].text, claims[0].riskLevel);
    if (level) {
      verdictLevel = level;
      sections.push(
        [`## Tingkat risiko: ${RISK_LEVEL_LABELS[level]}`, `> ${RISK_LEVEL_ADVICE[level]}`, reason.trim()].filter(Boolean).join("\n\n")
      );
    } else if (reason.trim()) {
      sections.push(`## Penilaian\n\n${reason.trim()}`);
    }
  }

  if (summary.trim()) sections.push(`## Ringkasan lowongan\n\n${summary.trim()}`);

  if (salary?.summary?.trim()) {
    const lines = [`## ${salary.title || "Gaji dan benefit"}`, `**Status:** ${salary.status}`, salary.summary.trim()];
    if (salary.highlights?.length) lines.push(salary.highlights.map((item: string) => `- ${item}`).join("\n"));
    if (salary.hint?.trim()) lines.push(`_${salary.hint.trim()}_`);
    sections.push(lines.join("\n\n"));
  }

  if (risks) {
    sections.push(
      [
        "## Indikator mencurigakan",
        ...risks.map((risk: { type: keyof typeof RISK_TYPE_LABELS; description: string; evidence?: string }) =>
          [`### ${RISK_TYPE_LABELS[risk.type] ?? risk.type}`, risk.description, risk.evidence ? `_Bukti: “${risk.evidence}”_` : ""]
            .filter(Boolean)
            .join("\n\n")
        ),
      ].join("\n\n")
    );
  }

  if (checks) {
    const findings = checks.filter((check: { status: string }) => check.status === "warning").length;
    sections.push(
      [
        `## Pemeriksaan yang dilakukan`,
        `${checks.length} pemeriksaan${findings ? `, ${findings} temuan` : ""}.`,
        checks
          .map((check: { label: string; status: string; detail: string }) => `- **${check.label}** (${CHECK_LABELS[check.status] ?? check.status}): ${check.detail}`)
          .join("\n"),
      ].join("\n\n")
    );
  }

  if (explanations) {
    sections.push(
      ["## Penjelasan", ...explanations.map((entry: { title: string; explanation: string }) => `### ${entry.title}\n\n${entry.explanation}`)].join("\n\n")
    );
  }

  if (kind === "action" && actionInsight?.points?.length) {
    sections.push(actionInsight.points.map((point: string) => `- ${point}`).join("\n"));
  }

  if (kind === "answer") sections.push(text);

  if (references) {
    const lines = references.map((reference: { title: string; snippet?: string; url?: string }) => {
      const label = reference.url ? `[${reference.title}](${reference.url})` : reference.title;
      const domain = reference.url ? domainOf(reference.url) : undefined;
      const note = reference.snippet?.trim() || (domain ? `Sumber: ${domain}` : "");
      return note ? `- ${label}: ${note}` : `- ${label}`;
    });
    sections.push(["## Sumber verifikasi", lines.join("\n")].join("\n\n"));
  }

  sections.push(`---\n\n_${DISCLAIMER}_`);

  return { title, markdown: `${sections.join("\n\n")}\n`, verdictLevel, attachments };
}

/** The line that goes with the PDF when it is shared. */
export function shareMessage(name?: string | null): string {
  const who = name?.trim();
  return who ? `Analisis Lowongan untuk ${who}, cek di sini!` : "Analisis Lowongan TelaahKarier, cek di sini!";
}

export function exportFilename(title: string, date: Date = new Date()): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `telaahkarier-${slug || "telaah"}-${date.toISOString().slice(0, 10)}.pdf`;
}
