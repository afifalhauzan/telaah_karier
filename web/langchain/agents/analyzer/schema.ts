import { z } from "zod";

export const RISK_LEVELS = ["rendah", "sedang", "tinggi"] as const;

export const RISK_TYPES = [
  "payment_request",
  "sensitive_data",
  "suspicious_contact",
  "overclaim",
  "missing_context",
  "bias",
  "tppo",
  "manipulation",
] as const;

export const RiskLevelSchema = z.enum(RISK_LEVELS);
export const RiskTypeSchema = z.enum(RISK_TYPES);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type RiskType = z.infer<typeof RiskTypeSchema>;

// Display strings, rendered as-is on the salary card badge.
export const SALARY_STATUSES = ["Wajar", "Perlu Diverifikasi", "Tidak Wajar", "Tidak Disebutkan"] as const;
export const SALARY_NOT_MENTIONED = "Tidak Disebutkan";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

/** What to tell the user at each risk level; shown on the verdict card and in exports. */
export const RISK_LEVEL_ADVICE: Record<RiskLevel, string> = {
  tinggi: "Jangan transfer uang atau kirim data pribadi dulu.",
  sedang: "Verifikasi ke kanal resmi perusahaan sebelum lanjut.",
  rendah: "Belum ada tanda bahaya utama, tetap cocokkan dengan kanal resmi.",
};

export const RISK_TYPE_LABELS: Record<RiskType, string> = {
  payment_request: "Permintaan Biaya",
  sensitive_data: "Data Sensitif",
  tppo: "Indikasi TPPO",
  suspicious_contact: "Kontak/Link Mencurigakan",
  manipulation: "Upaya Manipulasi",
  bias: "Tekanan Sosial",
  overclaim: "Janji Terlalu Muluk",
  missing_context: "Detail Tidak Lengkap",
};

// Older stored claims only carry the level inside the text ("Tingkat Risiko Awal: Sedang. ...").
const LEVEL_IN_TEXT = /^\s*tingkat\s+risiko(?:\s+awal)?\s*:\s*(rendah|sedang|tinggi)\s*\.?\s*/i;

export function splitClaim(text: string, riskLevel?: RiskLevel): { level?: RiskLevel; reason: string } {
  const match = text.match(LEVEL_IN_TEXT);
  return {
    level: riskLevel ?? (match?.[1].toLowerCase() as RiskLevel | undefined),
    reason: match ? text.slice(match[0].length) : text,
  };
}

export const ATTACHMENT_KINDS = [
  "poster_lowongan",
  "screenshot_chat",
  "surat_dokumen",
  "postingan_medsos",
  "lainnya",
  "bukan_lowongan",
] as const;
export const LEGIBILITY_LEVELS = ["jelas", "sebagian", "tidak_terbaca"] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export type Legibility = (typeof LEGIBILITY_LEVELS)[number];

// ok: nothing found; warning: a finding; info: worth knowing, not a finding; skipped: could not run.
export const CHECK_STATUSES = ["ok", "warning", "info", "skipped"] as const;

export const CheckSchema = z.object({
  label: z.string(),
  status: z.enum(CHECK_STATUSES),
  detail: z.string(),
});

export const CitationSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  title: z.string(),
  link: z.string(),
});

export const ReferenceSchema = z.object({
  title: z.string(),
  snippet: z.string().optional(),
  url: z.string().optional(),
  citations: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      title: z.string(),
      link: z.string(),
    })
  ),
});

export const ExplanationItemSchema = z.object({
  title: z.string(),
  explanation: z.string(),
});

export const SalaryBenefitAssessmentSchema = z.object({
  title: z.string(),
  status: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  hint: z.string().optional(),
});

export const ClaimSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  riskLevel: RiskLevelSchema,
});

export const RiskSchema = z.object({
  type: RiskTypeSchema,
  description: z.string(),
  evidence: z.string().optional(),
});

export const ReasoningSchema = z.object({
  intent: z.string(),
  steps: z.array(z.string()),
});

/**
 * Data contract streamed to the client (data-analysis and the sectional data-* parts).
 * The LLM never fills this directly: it fills LLMAnalysisOutputSchema, and analyze.ts maps
 * that output (plus retrieved sources and rule signals) into this shape.
 */
export const AnalysisSchema = z.object({
  conversationText: z.string(),
  claims: z
    .array(
      z.object({
        text: z.string(),
        confidence: z.number().min(0).max(1),
        riskLevel: z.enum(RISK_LEVELS),
      })
    )
    .default([]),
  salaryBenefit: z
    .object({
      title: z.string(),
      status: z.string(),
      summary: z.string(),
      highlights: z.array(z.string()),
      hint: z.string().optional(),
    })
    .optional(),
  risks: z
    .array(
      z.object({
        type: z.enum(RISK_TYPES),
        description: z.string(),
        evidence: z.string().optional(),
      })
    )
    .default([]),
  summary: z.string(),
  summaryCitations: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        title: z.string(),
        link: z.string(),
      })
    )
    .default([]),
  explanations: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
      })
    )
    .default([]),
  suggestedQuestions: z.array(z.string()).default([]),
  reasoning: z
    .array(
      z.object({
        intent: z.string(),
        steps: z.array(z.string()),
      })
    )
    .optional(),
  references: z
    .array(
      z.object({
        title: z.string(),
        snippet: z.string().optional(),
        url: z.string().optional(),
        citations: z
          .array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              title: z.string(),
              link: z.string(),
            })
          )
          .default([]),
      })
    )
    .default([]),
  // "ai" = model-backed analysis, "rule_fallback" = limited rule-based check used when the model is unavailable.
  mode: z.enum(["ai", "rule_fallback"]).optional(),
  // What the analysis actually read. Actions and follow-up answers reuse the transcript instead of
  // sending the attachments to the model again; the UI can show it so misreadings are visible.
  material: z
    .object({
      source: z.enum(["text", "attachment", "text_and_attachment"]),
      transcript: z.string().optional(),
      legibility: z.enum(LEGIBILITY_LEVELS).optional(),
      attachments: z
        .array(
          z.object({
            kind: z.enum(ATTACHMENT_KINDS),
            legibility: z.enum(LEGIBILITY_LEVELS),
          })
        )
        .default([]),
      visualCues: z.array(z.string()).default([]),
      entities: z
        .object({
          companyNames: z.array(z.string()).default([]),
          salaries: z.array(z.string()).default([]),
          locations: z.array(z.string()).default([]),
          phones: z.array(z.string()).default([]),
          emails: z.array(z.string()).default([]),
          urls: z.array(z.string()).default([]),
        })
        .optional(),
      // Shortlink destinations and the linked page, read before the analysis; reused by follow-ups.
      linkEvidence: z.string().optional(),
      // Earlier material of the same posting in this session, analyzed together with this message.
      earlierMaterial: z.string().optional(),
    })
    .optional(),
  // Every check the pipeline ran, in plain words, shown so the verdict's basis is visible.
  checks: z.array(CheckSchema).optional(),
  // Debunked cases sharing a contact or account with the posting, shown for the user to verify
  knownCases: z
    .array(z.object({ title: z.string(), url: z.string(), date: z.string(), shared: z.array(z.string()) }))
    .optional(),
  // The registration link sits in a bio only the applicant can open; the chat asks them to copy it
  bioLink: z.object({ platform: z.enum(["instagram", "tiktok", "facebook"]).optional(), handle: z.string().optional() }).optional(),
});

/**
 * What the model fills for the main analysis.
 * Kept fully inlined (no shared sub-schema instances) so the generated JSON schema has no $ref,
 * which the Gemini API rejects. References/URLs are deliberately absent: the model may only cite
 * retrieved sources by ID, and analyze.ts resolves those IDs to real URLs.
 */
export const LLMAnalysisOutputSchema = z.object({
  analysisSteps: z
    .array(z.string())
    .default([])
    .describe("3-5 langkah singkat yang dilakukan untuk sampai pada penilaian."),
  conversationText: z
    .string()
    .describe("Sapaan pembuka singkat (1-2 kalimat). Jangan menyalin materi lowongan."),
  // Gemini tends to fill optional objects anyway, so "is there enough to judge" is an explicit,
  // required flag that the server enforces instead of relying on riskAssessment being omitted.
  informationSufficient: z
    .boolean()
    .describe("false jika materi belum memuat informasi lowongan (perusahaan, posisi, atau cara melamar) yang cukup untuk dinilai."),
  riskAssessment: z
    .object({
      riskLevel: z.enum(RISK_LEVELS),
      text: z
        .string()
        .describe('Diawali "Tingkat Risiko Awal: Rendah/Sedang/Tinggi." lalu 1-2 kalimat alasan utama.'),
      confidence: z.number().min(0).max(1),
    })
    .optional()
    .describe("Penilaian risiko lowongan. Tidak dipakai jika informationSufficient = false."),
  risks: z
    .array(
      z.object({
        type: z.enum(RISK_TYPES),
        description: z.string(),
        evidence: z
          .string()
          .optional()
          .describe("Kutipan persis (maksimal 15 kata) dari materi yang menjadi dasar risiko ini."),
      })
    )
    .default([]),
  salaryBenefit: z
    .object({
      status: z.enum(SALARY_STATUSES),
      summary: z.string(),
      highlights: z.array(z.string()),
      hint: z.string().optional(),
    })
    .optional()
    .describe('Gunakan status "Tidak Disebutkan" jika materi tidak menyebut gaji atau benefit.'),
  summary: z.string(),
  summarySourceIds: z
    .array(z.string())
    .default([])
    .describe('ID sumber dari <sumber_pencarian> yang mendukung ringkasan, misal ["S1"]. Kosong jika tidak ada.'),
  explanations: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
      })
    )
    .default([]),
  suggestedQuestions: z.array(z.string()).default([]),
});

/** What the model fills when the user clicks an investigation action chip. */
export const LLMActionOutputSchema = z.object({
  openingText: z.string().describe("Satu kalimat pembuka singkat."),
  points: z
    .array(z.string())
    .describe("3-5 poin spesifik untuk lowongan ini. Boleh memakai **tebal** untuk kata kunci."),
  salaryBenefit: z
    .object({
      status: z.enum(SALARY_STATUSES),
      summary: z.string(),
      highlights: z.array(z.string()),
      hint: z.string().optional(),
    })
    .optional()
    .describe("Hanya diisi untuk aksi kewajaran gaji dan benefit."),
});

/** What the model fills when reading attachments (images, documents) before the analysis. */
export const LLMExtractionOutputSchema = z.object({
  attachments: z
    .array(
      z.object({
        kind: z.enum(ATTACHMENT_KINDS),
        legibility: z.enum(LEGIBILITY_LEVELS),
        transcript: z
          .string()
          .describe("Seluruh teks lampiran persis sesuai urutan baca; bagian yang tidak terbaca ditandai [tidak terbaca]."),
      })
    )
    .describe("Satu item per lampiran, sesuai urutan lampiran."),
  entities: z.object({
    companyNames: z.array(z.string()).default([]),
    salaries: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    phones: z.array(z.string()).default([]),
    emails: z.array(z.string()).default([]),
    urls: z.array(z.string()).default([]),
  }),
  visualCues: z
    .array(z.string())
    .default([])
    .describe("Maksimal 3 pengamatan visual yang relevan dengan keaslian; kosong jika tidak ada."),
});

/** Decides whether a short text-only message is new material to analyze or a question. */
export const LLMRouterOutputSchema = z.object({
  intent: z.enum(["materi_lowongan", "pertanyaan"]),
});

/** What the model fills when answering a follow-up or general question. */
export const LLMFollowUpOutputSchema = z.object({
  answer: z
    .string()
    .describe("Jawaban dalam Markdown, maksimal sekitar 120 kata. Rujuk sumber dengan penanda seperti [S1]."),
  sourceIds: z
    .array(z.string())
    .default([])
    .describe('ID sumber dari <sumber_pencarian> yang dipakai dalam jawaban, misal ["S1"].'),
  suggestedQuestions: z
    .array(z.string())
    .default([])
    .describe("2-3 pertanyaan lanjutan singkat dari sudut pandang pengguna kepada TelaahKarier."),
});

export type Check = z.infer<typeof CheckSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Reasoning = z.infer<typeof ReasoningSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type ExplanationItem = z.infer<typeof ExplanationItemSchema>;
export type SalaryBenefitAssessment = z.infer<typeof SalaryBenefitAssessmentSchema>;
export type AnalysisResult = z.infer<typeof AnalysisSchema>;
export type KnownCase = NonNullable<AnalysisResult["knownCases"]>[number];
export type BioLink = NonNullable<AnalysisResult["bioLink"]>;
export type LLMAnalysisOutput = z.infer<typeof LLMAnalysisOutputSchema>;
export type LLMActionOutput = z.infer<typeof LLMActionOutputSchema>;
export type LLMFollowUpOutput = z.infer<typeof LLMFollowUpOutputSchema>;
export type LLMExtractionOutput = z.infer<typeof LLMExtractionOutputSchema>;
