import { geminiModelFor, getLLMModel, readTokenUsage, type TokenUsage } from "./llm";
import {
  LLMExtractionOutputSchema,
  type AttachmentKind,
  type Legibility,
  type LLMExtractionOutput,
} from "./schema";
import { buildExtractionUserPrompt, extractionSystemPrompt } from "./prompts";
import { redactSensitive } from "./redaction";
import type { AnalyzeImage } from "./analyze";
import {
  ATTACHMENT_LIMITS_TEXT,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  isSupportedAttachment,
} from "../../../lib/attachments";

/**
 * "Read first" stage: attachments are transcribed once, and everything downstream (rules, web
 * search, quote verification, actions, follow-up answers) works on that text instead of the image.
 */

export interface ExtractedMaterial {
  // Text read from all attachments, with a [Lampiran n] header per attachment when there are several.
  transcript: string;
  attachments: Array<{ kind: AttachmentKind; legibility: Legibility }>;
  legibility: Legibility;
  entities: LLMExtractionOutput["entities"];
  visualCues: string[];
}

export type ExtractionStatus = "ok" | "unreadable" | "not_job" | "error";

export interface ExtractionRun {
  status: ExtractionStatus;
  material?: ExtractedMaterial;
  model: string;
  ms: number;
  tokenUsage?: TokenUsage;
  errorMessage?: string;
}

export { ATTACHMENT_LIMITS_TEXT, MAX_ATTACHMENTS, isSupportedAttachment };
const EXTRACTION_TIMEOUT_MS = 30_000;
const MAX_VISUAL_CUES = 3;
const MATERIAL_HEADER = "[Teks dari lampiran]";

const KIND_LABELS: Record<AttachmentKind, string> = {
  poster_lowongan: "poster lowongan",
  screenshot_chat: "screenshot chat",
  surat_dokumen: "surat/dokumen",
  postingan_medsos: "postingan media sosial",
  lainnya: "gambar lain",
  bukan_lowongan: "bukan materi lowongan",
};

function decodedSize(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** Keeps at most MAX_ATTACHMENTS attachments within the size limit and reports how many were dropped. */
export function limitAttachments(attachments: AnalyzeImage[]): { usable: AnalyzeImage[]; skipped: number } {
  const usable = attachments
    .filter((attachment) => decodedSize(attachment.url) <= MAX_ATTACHMENT_BYTES)
    .slice(0, MAX_ATTACHMENTS);
  return { usable, skipped: attachments.length - usable.length };
}

/** The user's text plus the text read from attachments, as one block for rules, search, and the model. */
export function composeMaterialText(userText: string, transcript: string | undefined): string {
  const parts = [userText.trim()];
  if (transcript?.trim()) {
    parts.push(`${MATERIAL_HEADER}\n${transcript.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function overallLegibility(levels: Legibility[]): Legibility {
  if (levels.every((level) => level === "tidak_terbaca")) {
    return "tidak_terbaca";
  }
  return levels.some((level) => level !== "jelas") ? "sebagian" : "jelas";
}

export async function extractAttachments(attachments: AnalyzeImage[]): Promise<ExtractionRun> {
  const startedAt = Date.now();
  const model = geminiModelFor("extraction");

  try {
    const structuredLlm = getLLMModel({ temperature: 0, stage: "extraction" }).withStructuredOutput(
      LLMExtractionOutputSchema,
      { includeRaw: true }
    );

    const { raw, parsed } = await structuredLlm.invoke(
      [
        { role: "system", content: extractionSystemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionUserPrompt(attachments.length) },
            ...attachments.map((attachment) => ({ type: "image_url", image_url: attachment.url })),
          ],
        },
      ],
      { signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS) }
    );

    if (!parsed) {
      throw new Error("Model output did not match LLMExtractionOutputSchema");
    }

    const read = parsed.attachments ?? [];
    const transcripts = read.map((attachment) => attachment.transcript?.trim() ?? "");
    const transcript =
      read.length > 1
        ? transcripts.map((text, index) => `[Lampiran ${index + 1}]\n${text}`).join("\n\n")
        : transcripts[0] ?? "";

    // An image cannot be masked before the model reads it; what it read is masked before the
    // transcript goes to the rules, the web search, the analysis, and back to the client.
    const entities = parsed.entities && { ...parsed.entities, phones: (parsed.entities.phones ?? []).map((phone) => redactSensitive(phone)) };
    const material: ExtractedMaterial = {
      transcript: redactSensitive(transcript.trim()),
      attachments: read.map(({ kind, legibility }) => ({ kind, legibility })),
      legibility: read.length ? overallLegibility(read.map((attachment) => attachment.legibility)) : "tidak_terbaca",
      entities,
      visualCues: (parsed.visualCues ?? [])
        .map((cue) => cue.trim())
        .filter(Boolean)
        .slice(0, MAX_VISUAL_CUES),
    };

    const readableText = material.transcript.replace(/\[tidak terbaca\]/gi, "").trim();
    let status: ExtractionStatus = "ok";
    if (material.legibility === "tidak_terbaca" || !readableText) {
      status = "unreadable";
    } else if (read.every((attachment) => attachment.kind === "bukan_lowongan")) {
      status = "not_job";
    }

    return { status, material, model, ms: Date.now() - startedAt, tokenUsage: readTokenUsage(raw) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Extraction] Reading attachments failed:", errorMessage);
    return { status: "error", model, ms: Date.now() - startedAt, errorMessage };
  }
}

export function describeExtractionForProgress(run: ExtractionRun): string {
  const material = run.material;

  if (run.status === "error" || !material) {
    return "Pembacaan lampiran gagal, lampiran dianalisis langsung oleh model";
  }
  if (run.status === "unreadable") {
    return "Membaca isi lampiran: teks tidak terbaca";
  }

  const kinds = Array.from(new Set(material.attachments.map((attachment) => KIND_LABELS[attachment.kind]))).join(", ");
  const legibility = material.legibility === "jelas" ? "jelas" : "sebagian";
  return `Membaca isi lampiran: ${kinds}, teks terbaca ${legibility} (${material.transcript.length} karakter)`;
}
