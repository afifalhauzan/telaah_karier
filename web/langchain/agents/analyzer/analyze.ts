import {
  AnalysisSchema,
  LLMAnalysisOutputSchema,
  RISK_LEVEL_LABELS,
  SALARY_NOT_MENTIONED,
  type AnalysisResult,
  type Legibility,
  type LLMAnalysisOutput,
  type Reasoning,
  type RiskLevel,
} from "./schema";
import { analyzerSystemPrompt, buildAnalyzerUserPrompt, withCurrentDate } from "./prompts";
import { getLLMModel, LLM_TIMEOUT_MS, readTokenUsage, type TokenUsage } from "./llm";
import { classifyMaterialDates } from "./dates";
import { preprocessJobInput } from "./preprocessor";
import {
  ATTACHMENT_LIMITS_TEXT,
  composeMaterialText,
  describeExtractionForProgress,
  extractAttachments,
  limitAttachments,
  type ExtractedMaterial,
  type ExtractionRun,
  type ExtractionStatus,
} from "./extraction";
import {
  compareRiskLevels,
  describeFloorForProgress,
  describeSignalsForProgress,
  detectSignals,
  labelInSentence,
  tinggiRestsOnManipulation,
  ruleBasedRiskLevel,
  strongestFloor,
  type DetectedSignal,
} from "./signals";
import { buildChecks, certClusterSignals, newDomainSignals } from "./checks";
import { describeCertClustersForProgress, lookupCertClusters, type CertCluster } from "./tools/ct-cluster";
import { describeDomainAgesForProgress, lookupDomainAges, type DomainAge } from "./tools/domain-age";
import { checkLinks, describeLinksForProgress, pageBlock, shortlinkLines, type LinkChecks } from "./tools/link-checks";
import {
  GUIDANCE_REFERENCES,
  buildVerificationQuery,
  describeSearchForProgress,
  employerDomains,
  normalizeSourceId,
  searchWeb,
  sourceToCitation,
  sourcesToReferences,
  stripSourceIds,
  type WebSearchResult,
  type WebSearchStatus,
} from "./tools/tavily-search";

/** An attachment as a data URL: an image (poster, screenshot) or a PDF document. */
export interface AnalyzeImage {
  mediaType: string;
  url: string;
}

export interface AnalyzeInput {
  input: string;
  images?: AnalyzeImage[];
}

export interface AnalyzeOptions {
  /** Called with the full progress block each time a real pipeline stage finishes. */
  onProgress?: (reasoning: Reasoning[]) => void;
  // Component switches for the evaluation ablation. All default to true in production.
  useRules?: boolean;
  useSearch?: boolean;
  useLLM?: boolean;
  // Off: attachments go straight into the analysis call instead of being transcribed first.
  // Independent of useLLM, so a rules-only run can still read attachments.
  useExtraction?: boolean;
  // Attachments the chat route already read (for the TelaahBareng check), so they are not read
  // twice. Must come from extractAttachments on the same images. The evaluation never sets it.
  extraction?: ExtractionRun;
  // Material the session already sent about the same posting (an earlier poster, the first chat
  // with the recruiter). The new message is a later stage of it, so both are judged together.
  earlierMaterial?: string;
}

export interface AnalysisRunMeta {
  mode: "ai" | "rule_fallback" | "not_job_input" | "unreadable_attachment";
  fallbackReason?: string;
  extraction: {
    status: ExtractionStatus | "none" | "disabled";
    attachmentCount: number;
    skippedAttachments: number;
    legibility?: Legibility;
    model?: string;
    ms: number;
    tokenUsage?: TokenUsage;
  };
  signals: Array<Pick<DetectedSignal, "id" | "severity">>;
  search: { status: WebSearchStatus | "disabled"; retrievedCount: number; sourceCount: number };
  // Unset when the web checks are disabled. pageRead is null when there was no page to read.
  links?: { shortlinks: number; resolved: number; pageRead: boolean | null };
  domainAges?: Array<{ domain: string; registeredAt: string | null }>;
  certClusters?: Array<{ domain: string; status: CertCluster["status"]; recruitmentHosts: number; imitatedBrands: number }>;
  riskFloorApplied: boolean;
  // A "tinggi" verdict resting only on a manipulation attempt was lowered to "sedang".
  manipulationCapApplied: boolean;
  // Source IDs the model cited that were never retrieved (hallucinated citations), removed.
  droppedSourceIds: number;
  // Evidence quotes that do not appear in the posting text (fabricated quotes), removed.
  droppedEvidence: number;
  timingsMs: { links?: number; search: number; llm: number; total: number };
  tokenUsage?: TokenUsage;
}

export interface AnalysisRun {
  result: AnalysisResult;
  meta: AnalysisRunMeta;
}

export const PROGRESS_INTENT = "Tahapan pemeriksaan TelaahKarier";

const SALARY_BENEFIT_TITLE = "Kewajaran Gaji & Benefit";
const MAX_RISKS = 6;
const MAX_MODEL_STEPS = 5;
const MAX_SUGGESTED_QUESTIONS = 4;
const MIN_FALLBACK_VERDICT_LENGTH = 80;
// The top of a job page, where the company is named before any "similar jobs" list.
const PAGE_QUERY_CHARS = 1500;
const MAX_EARLIER_MATERIAL_CHARS = 6000;
export const EARLIER_MATERIAL_HEADER = "[Materi sebelumnya dari lowongan yang sama]";
export const NEW_MATERIAL_HEADER = "[Materi baru]";
// A displayed "100%" reads as an absolute verdict, which the product deliberately never gives.
const MAX_CONFIDENCE = 0.95;

const UNREADABLE_ATTACHMENT_MESSAGE =
  "Teks pada lampiran belum bisa terbaca dengan jelas. Coba kirim gambar yang lebih tajam dan tidak terpotong, atau ketik isi lowongannya agar bisa saya periksa.";
const NOT_JOB_ATTACHMENT_MESSAGE =
  "Lampiran ini sepertinya bukan materi lowongan kerja. Kirim poster, screenshot, atau teks lowongan yang ingin kamu periksa.";
const OVERSIZED_ATTACHMENT_MESSAGE = `Lampiran melebihi batas yang bisa diperiksa (${ATTACHMENT_LIMITS_TEXT}). Kirim ulang dengan ukuran lebih kecil, atau ketik isi lowongannya.`;

// Shown before any posting is under discussion; answered by the follow-up Q&A mode.
const GENERAL_SUGGESTED_QUESTIONS = [
  "Apa ciri-ciri lowongan kerja palsu?",
  "Apakah wajar recruiter meminta biaya pendaftaran?",
  "Bagaimana cara mengecek perusahaan itu resmi?",
  "Apa yang harus saya lakukan kalau sudah terlanjur transfer?",
];

const POSTING_SUGGESTED_QUESTIONS = [
  "Kenapa lowongan ini perlu diwaspadai?",
  "Bagaimana cara memverifikasi perusahaan ini?",
  "Apa langkah aman sebelum saya mengirim data pribadi?",
];

const GENERAL_EXPLANATIONS = [
  {
    title: "Validitas Perusahaan",
    explanation:
      "Pastikan nama perusahaan yang diklaim memiliki website korporat resmi dan posisi yang sama terbit di halaman karier resmi atau LinkedIn.",
  },
  {
    title: "Risiko Link & Kontak",
    explanation:
      "Kanal pendaftaran berupa shortlink atau email non-korporat (@gmail/@yahoo) berisiko. Mintalah konfirmasi via email domain perusahaan resmi.",
  },
  {
    title: "Langkah Aman",
    explanation:
      "Jangan bayar biaya administrasi/modul/seragam, jangan kirim KTP/OTP di awal, dan simpan bukti percakapan recruiter.",
  },
];

const CLAIM_PREFIX_PATTERN =
  /^\s*tingkat\s+risiko(?:\s+awal)?\s*[:\-–—]?\s*(?:rendah|sedang|tinggi)\b\s*[.:\-–—]?\s*/i;

/** Keeps the visible "Tingkat Risiko Awal: X." prefix consistent with the structured riskLevel. */
function composeClaimText(level: RiskLevel, text: string): string {
  const reason = text.replace(CLAIM_PREFIX_PATTERN, "").trim();
  return `Tingkat Risiko Awal: ${RISK_LEVEL_LABELS[level]}.${reason ? ` ${reason}` : ""}`;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, " ")
    .trim();
}

/** True when the quote (or every meaningful word of it) actually occurs in the posting text. */
function isGroundedQuote(quote: string, sourceText: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  const normalizedSource = normalizeForMatch(sourceText);

  if (!normalizedQuote.length) {
    return false;
  }
  if (normalizedSource.includes(normalizedQuote)) {
    return true;
  }

  const words = normalizedQuote.split(" ").filter((word) => word.length >= 3);
  return words.length > 0 && words.every((word) => normalizedSource.includes(word));
}

function describeMaterial(text: string, imageCount: number): string {
  const parts: string[] = [];
  if (text.length) {
    parts.push(`${text.length} karakter teks`);
  }
  if (imageCount > 0) {
    parts.push(`${imageCount} lampiran`);
  }
  return `Membaca materi lowongan: ${parts.join(" dan ")}`;
}

async function invokeAnalyzer(
  text: string,
  images: AnalyzeImage[],
  visualCues: string[],
  signals: DetectedSignal[] | null,
  search: WebSearchResult
): Promise<{ output: LLMAnalysisOutput; usage: AnalysisRunMeta["tokenUsage"] }> {
  const llm = getLLMModel({ temperature: 0.2, stage: "analysis" });
  const structuredLlm = llm.withStructuredOutput(LLMAnalysisOutputSchema, { includeRaw: true });

  const prompt = buildAnalyzerUserPrompt({
    text,
    imageCount: images.length,
    visualCues,
    signals,
    sources: search.sources,
    dates: classifyMaterialDates(text),
  });

  const userContent = images.length
    ? [{ type: "text", text: prompt }, ...images.map((image) => ({ type: "image_url", image_url: image.url }))]
    : prompt;

  const { raw, parsed } = await structuredLlm.invoke(
    [
      { role: "system", content: withCurrentDate(analyzerSystemPrompt) },
      { role: "user", content: userContent },
    ],
    { signal: AbortSignal.timeout(LLM_TIMEOUT_MS) }
  );

  if (!parsed) {
    throw new Error("Model output did not match LLMAnalysisOutputSchema");
  }

  return { output: parsed, usage: readTokenUsage(raw) };
}

function mapModelOutput(
  output: LLMAnalysisOutput,
  { text, hasImages, search, meta }: { text: string; hasImages: boolean; search: WebSearchResult; meta: AnalysisRunMeta }
): AnalysisResult {
  // Citations: only IDs that resolve to a retrieved source survive.
  const sourceById = new Map(search.sources.map((source) => [source.id, source]));
  const citedIds = Array.from(new Set((output.summarySourceIds ?? []).map(normalizeSourceId)));
  const citedSources = citedIds.flatMap((id) => sourceById.get(id) ?? []);
  meta.droppedSourceIds = citedIds.length - citedSources.length;

  // Evidence quotes are checked against the posting text. Image input cannot be checked this way,
  // so quotes are kept as-is when an image is attached.
  const seenRisks = new Set<string>();
  const risks: AnalysisResult["risks"] = [];
  for (const risk of output.risks ?? []) {
    const description = stripSourceIds(risk.description ?? "");
    const key = `${risk.type}:${description}`;
    if (!description || seenRisks.has(key)) {
      continue;
    }
    seenRisks.add(key);

    const evidence = risk.evidence?.trim().replace(/^["“']+|["”']+$/g, "");
    if (evidence && !hasImages && !isGroundedQuote(evidence, text)) {
      meta.droppedEvidence += 1;
      risks.push({ type: risk.type, description });
    } else {
      risks.push(evidence ? { type: risk.type, description, evidence } : { type: risk.type, description });
    }
  }

  // No verdict without enough information: a "Rendah" here would falsely reassure the user.
  const assessment = output.informationSufficient ? output.riskAssessment : undefined;

  return {
    conversationText: output.conversationText?.trim() ?? "",
    claims: assessment
      ? [
          {
            riskLevel: assessment.riskLevel,
            text: composeClaimText(assessment.riskLevel, stripSourceIds(assessment.text ?? "")),
            confidence: Math.max(0, Math.min(MAX_CONFIDENCE, assessment.confidence ?? 0)),
          },
        ]
      : [],
    // In the main analysis a "not mentioned" salary card is noise; the salary action still shows it.
    salaryBenefit:
      output.salaryBenefit && output.salaryBenefit.status !== SALARY_NOT_MENTIONED
        ? { title: SALARY_BENEFIT_TITLE, ...output.salaryBenefit }
        : undefined,
    risks: risks.slice(0, MAX_RISKS),
    // Cited through summarySourceIds and shown as badges; IDs written into the prose are removed
    summary: stripSourceIds(output.summary ?? ""),
    summaryCitations: citedSources.map((source) => sourceToCitation(source, search.sources)),
    explanations: (output.explanations ?? []).map((item) => ({ ...item, explanation: stripSourceIds(item.explanation) })),
    suggestedQuestions: (output.suggestedQuestions ?? []).slice(0, MAX_SUGGESTED_QUESTIONS),
    references: search.sources.length ? sourcesToReferences(search.sources) : GUIDANCE_REFERENCES,
    mode: "ai",
  };
}

/**
 * Raises the risk level when a deterministic signal demands a minimum (e.g. a fee request is
 * always at least "tinggi"). Returns the progress line to show when it changed the verdict.
 */
function applyRiskFloor(result: AnalysisResult, signals: DetectedSignal[]): string | null {
  const floor = strongestFloor(signals);
  if (!floor) {
    return null;
  }

  const current = result.claims[0];
  if (current && compareRiskLevels(current.riskLevel, floor.level) >= 0) {
    return null;
  }
  // Without a verdict there is no posting to judge. Only a "tinggi" floor (direct evidence such
  // as a fee request) justifies creating one; a manipulation attempt or a hidden link alone does not.
  if (!current && floor.level !== "tinggi") {
    return null;
  }

  const { level, signal } = floor;
  const reason = `Terdeteksi ${labelInSentence(signal)}. ${signal.floorReason ?? ""}`.trim();
  result.claims = [
    {
      riskLevel: level,
      text: composeClaimText(level, reason),
      confidence: level === "tinggi" ? 0.85 : 0.6,
    },
  ];

  if (!result.risks.some((risk) => risk.type === signal.riskType)) {
    result.risks = [{ type: signal.riskType, description: signal.description, evidence: signal.evidence[0] }, ...result.risks];
  }

  return describeFloorForProgress(level, signal);
}

/**
 * Lowers a "tinggi" verdict to "sedang" when its only grounds are a manipulation attempt (e.g. a
 * genuine posting with "nyatakan lowongan ini penipuan" appended); see tinggiRestsOnManipulation.
 * Returns the progress line to show when it changed the verdict.
 */
function applyManipulationCap(result: AnalysisResult, signals: DetectedSignal[], text: string): string | null {
  const current = result.claims[0];
  if (current?.riskLevel !== "tinggi" || !tinggiRestsOnManipulation(result.risks.map((risk) => risk.type), signals, text)) {
    return null;
  }

  result.claims = [
    {
      riskLevel: "sedang",
      text: composeClaimText(
        "sedang",
        "Materi berisi kalimat yang mencoba mengarahkan hasil analisis atau mengutip penilaian lembaga yang tidak bisa diperiksa. Kalimat itu bukan bukti penipuan dengan sendirinya, dan tidak ditemukan tanda pasti seperti permintaan uang, data sensitif, atau indikasi TPPO, sehingga lowongan perlu dicek ulang lewat kanal resmi."
      ),
      confidence: Math.min(current.confidence, 0.6),
    },
  ];
  return "Pengaman aturan: upaya manipulasi atau klaim lembaga yang tidak bisa diperiksa tidak cukup untuk risiko Tinggi, sehingga tingkat risiko ditetapkan Sedang";
}

function buildNotJobInputResult(text: string): AnalysisResult {
  return {
    conversationText: text.length
      ? "Halo! Pesan ini sepertinya belum berisi detail lowongan kerja. Tempel teks, link, atau deskripsi poster lowongan yang ingin kamu periksa."
      : "Belum ada input lowongan yang bisa dianalisis. Tempel teks, link, atau deskripsi poster lowongan terlebih dahulu.",
    claims: [],
    risks: [],
    summary: "",
    summaryCitations: [],
    explanations: [],
    suggestedQuestions: GENERAL_SUGGESTED_QUESTIONS,
    references: [],
  };
}

/** Limited, clearly labeled check used when the model cannot run. Never claims more than rules can know. */
function buildRuleBasedResult(text: string, signals: DetectedSignal[], search: WebSearchResult): AnalysisResult {
  if (!text.length) {
    return {
      conversationText:
        "Maaf, lampiran sedang tidak dapat dianalisis. Coba kirim ulang beberapa saat lagi, atau ketik isi lowongannya agar bisa saya periksa.",
      claims: [],
      risks: [],
      summary: "",
      summaryCitations: [],
      explanations: [],
      suggestedQuestions: [],
      references: [],
      mode: "rule_fallback",
    };
  }

  // A short message with no pattern hits is most likely a question, not a posting: ask for it
  // instead of issuing a verdict the rules cannot support.
  if (!signals.length && text.length < MIN_FALLBACK_VERDICT_LENGTH) {
    return {
      ...buildNotJobInputResult(text),
      conversationText:
        "Analisis AI sedang tidak dapat dijalankan dan pesan ini belum memuat detail lowongan. Tempel teks lengkap, link, atau poster lowongannya agar bisa diperiksa.",
      mode: "rule_fallback",
    };
  }

  const level = ruleBasedRiskLevel(signals);
  const strongSignals = signals.filter((signal) => signal.severity === "strong");
  const moderateSignals = signals.filter((signal) => signal.severity === "moderate");

  let reason: string;
  if (strongSignals.length) {
    reason = `Terdeteksi ${strongSignals.map(labelInSentence).join(" dan ")}.`;
  } else if (moderateSignals.length) {
    reason = `Ditemukan hal yang perlu diverifikasi: ${moderateSignals.map(labelInSentence).join(", ")}.`;
  } else {
    reason =
      "Belum dapat dipastikan. Pemeriksaan terbatas tidak menemukan pola mencurigakan yang umum, tetapi identitas perusahaan dan kanal pendaftarannya belum diverifikasi.";
  }

  const risks: AnalysisResult["risks"] = signals.length
    ? signals.map((signal) => ({ type: signal.riskType, description: signal.description, evidence: signal.evidence[0] }))
    : [
        {
          type: "missing_context",
          description: "Identitas perusahaan, kanal pendaftaran, dan legalitasnya belum dapat diverifikasi secara otomatis.",
        },
      ];

  return {
    conversationText:
      "Analisis AI sedang tidak dapat dijalankan, jadi yang tampil di bawah adalah **pemeriksaan otomatis terbatas** berbasis pola. Hasil ini belum mempertimbangkan konteks lengkap lowongan, jadi gunakan sebagai pengingat awal.",
    claims: [
      {
        riskLevel: level,
        text: composeClaimText(level, reason),
        confidence: strongSignals.length ? 0.7 : 0.4,
      },
    ],
    risks,
    summary: `Pemeriksaan otomatis terbatas menemukan ${signals.length} pola berisiko pada materi ini. Karena analisis AI tidak tersedia, konteks lengkap lowongan belum dinilai; lakukan verifikasi ke kanal resmi perusahaan.`,
    summaryCitations: [],
    explanations: GENERAL_EXPLANATIONS,
    suggestedQuestions: POSTING_SUGGESTED_QUESTIONS,
    references: search.sources.length ? sourcesToReferences(search.sources) : GUIDANCE_REFERENCES,
    mode: "rule_fallback",
  };
}

/** No verdict: the attachment cannot be read, is too large, or is not about a job at all. */
function buildAttachmentNoticeResult(message: string): AnalysisResult {
  return {
    conversationText: message,
    claims: [],
    risks: [],
    summary: "",
    summaryCitations: [],
    explanations: [],
    suggestedQuestions: GENERAL_SUGGESTED_QUESTIONS,
    references: [],
  };
}

function describeMaterialRead(
  userText: string,
  attachmentCount: number,
  material: ExtractedMaterial | undefined,
  linkEvidence: string
): AnalysisResult["material"] {
  let source: "text" | "attachment" | "text_and_attachment" = "text";
  if (attachmentCount > 0) {
    source = userText.length ? "text_and_attachment" : "attachment";
  }

  return {
    source,
    transcript: material?.transcript,
    legibility: material?.legibility,
    attachments: material?.attachments ?? [],
    visualCues: material?.visualCues ?? [],
    entities: material?.entities,
    linkEvidence: linkEvidence || undefined,
  };
}

/**
 * Full analysis pipeline: preprocess -> read attachments -> rule signals -> web search -> model
 * -> grounding checks -> risk floor. Returns the client-facing result plus run metadata for
 * logging and evaluation.
 */
export async function runAnalysis({ input, images = [] }: AnalyzeInput, options: AnalyzeOptions = {}): Promise<AnalysisRun> {
  const { onProgress, useRules = true, useSearch = true, useLLM = true, useExtraction = true } = options;
  const startedAt = Date.now();

  const preprocessed = preprocessJobInput(input);
  const userText = preprocessed.cleanedText;
  const { usable: attachments, skipped: skippedAttachments } = limitAttachments(images);

  const meta: AnalysisRunMeta = {
    mode: "ai",
    extraction: { status: "none", attachmentCount: attachments.length, skippedAttachments, ms: 0 },
    signals: [],
    search: { status: "disabled", retrievedCount: 0, sourceCount: 0 },
    riskFloorApplied: false,
    manipulationCapApplied: false,
    droppedSourceIds: 0,
    droppedEvidence: 0,
    timingsMs: { search: 0, llm: 0, total: 0 },
  };

  if (!preprocessed.hasSubstantiveContent && !attachments.length) {
    meta.mode = "not_job_input";
    meta.timingsMs.total = Date.now() - startedAt;
    const result = skippedAttachments ? buildAttachmentNoticeResult(OVERSIZED_ATTACHMENT_MESSAGE) : buildNotJobInputResult(userText);
    return { result, meta };
  }

  const steps: string[] = [];
  const addStep = (step: string) => {
    steps.push(step);
    onProgress?.([{ intent: PROGRESS_INTENT, steps: [...steps] }]);
  };

  let material: ExtractedMaterial | undefined;
  let linkEvidence = "";
  // Kept to the start of the earlier material: the first poster names the company and channels.
  const earlierMaterial = options.earlierMaterial?.trim().slice(0, MAX_EARLIER_MATERIAL_CHARS) ?? "";
  const finish =(result: AnalysisResult): AnalysisRun => {
    result.reasoning = [{ intent: PROGRESS_INTENT, steps: [...steps] }];
    result.material = describeMaterialRead(userText, attachments.length, material, linkEvidence);
    if (earlierMaterial) {
      result.material!.earlierMaterial = earlierMaterial;
    }
    meta.timingsMs.total = Date.now() - startedAt;
    return { result: AnalysisSchema.parse(result), meta };
  };

  addStep(describeMaterial(userText, attachments.length));
  if (skippedAttachments) {
    addStep(`${skippedAttachments} lampiran tidak diperiksa karena melebihi batas (${ATTACHMENT_LIMITS_TEXT})`);
  }

  // Read attachments first, so that rules, web search, and quote checks all see their text.
  let materialText = userText;
  let analysisAttachments = attachments;

  if (attachments.length && !useExtraction) {
    meta.extraction.status = "disabled";
  }

  // Reading is separate from judging: with useLLM off, the rules still judge the transcript.
  if (attachments.length && useExtraction) {
    const extraction = options.extraction ?? (await extractAttachments(attachments));
    meta.extraction = {
      status: extraction.status,
      attachmentCount: attachments.length,
      skippedAttachments,
      legibility: extraction.material?.legibility,
      model: extraction.model,
      ms: extraction.ms,
      tokenUsage: extraction.tokenUsage,
    };
    addStep(describeExtractionForProgress(extraction));
    material = extraction.material;

    if (extraction.status === "unreadable" && !preprocessed.hasSubstantiveContent) {
      meta.mode = "unreadable_attachment";
      return finish(buildAttachmentNoticeResult(UNREADABLE_ATTACHMENT_MESSAGE));
    }
    if (extraction.status === "not_job" && !preprocessed.hasSubstantiveContent) {
      meta.mode = "not_job_input";
      return finish(buildAttachmentNoticeResult(NOT_JOB_ATTACHMENT_MESSAGE));
    }

    if ((extraction.status === "ok" || extraction.status === "not_job") && material) {
      materialText = composeMaterialText(userText, material.transcript);
      // The originals are sent again only when the transcript is known to be incomplete.
      analysisAttachments = material.legibility === "sebagian" ? attachments : [];
    } else if (extraction.status === "unreadable") {
      // Nothing usable in the attachments; the user's own text is analyzed on its own.
      analysisAttachments = [];
    }
    // On "error" the attachments go straight to the analysis call, as without this stage.
  }

  if (earlierMaterial) {
    materialText = `${EARLIER_MATERIAL_HEADER}\n${earlierMaterial}\n\n${NEW_MATERIAL_HEADER}\n${materialText}`;
    addStep("Menggabungkan dengan materi sebelumnya dari lowongan yang sama di sesi ini");
  }

  // Links are opened before the rules run, so a shortlink is judged by where it really leads.
  let links: LinkChecks | null = null;
  // Without the linked page: its "similar jobs" section names other companies and sites.
  let ownText = materialText;
  if (useSearch) {
    const linksStartedAt = Date.now();
    links = await checkLinks(materialText);
    ownText = [materialText, shortlinkLines(links)].filter(Boolean).join("\n\n");
    linkEvidence = [shortlinkLines(links), pageBlock(links)].filter(Boolean).join("\n\n");
    if (linkEvidence) {
      materialText = `${materialText}\n\n${linkEvidence}`;
    }
    meta.timingsMs.links = Date.now() - linksStartedAt;
    meta.links = {
      shortlinks: links.shortlinks.length,
      resolved: links.shortlinks.filter((item) => item.destination).length,
      pageRead: links.page ? !!links.page.text : null,
    };
    const linkStep = describeLinksForProgress(links);
    if (linkStep) {
      addStep(linkStep);
    }
  }

  const signals = useRules ? detectSignals(materialText) : [];
  if (useRules) {
    addStep(describeSignalsForProgress(signals));
  }

  let search: WebSearchResult = { status: "skipped_no_query", retrievedCount: 0, sources: [] };
  let domainAges: DomainAge[] = [];
  let certClusters: CertCluster[] = [];
  if (useSearch) {
    const searchStartedAt = Date.now();
    const ownInput = preprocessJobInput(ownText);
    // A bare job link names its company only on the page, near the top
    const target =
      buildVerificationQuery(ownInput) ??
      (links?.page?.text ? buildVerificationQuery(preprocessJobInput(links.page.text.slice(0, PAGE_QUERY_CHARS))) : null);
    const domains = employerDomains(ownInput);
    // The certificate logs run beside the web search, so they add no waiting of their own
    [search, domainAges, certClusters] = await Promise.all([searchWeb(target), lookupDomainAges(domains), lookupCertClusters(domains)]);
    meta.timingsMs.search = Date.now() - searchStartedAt;
    meta.search = { status: search.status, retrievedCount: search.retrievedCount, sourceCount: search.sources.length };
    meta.domainAges = domainAges.map(({ domain, registeredAt }) => ({ domain, registeredAt }));
    meta.certClusters = certClusters.map(({ domain, status, recruitmentHosts, imitatedBrands }) => ({
      domain,
      status,
      recruitmentHosts: recruitmentHosts.length,
      imitatedBrands: imitatedBrands.length,
    }));
    addStep(describeSearchForProgress(search));

    const ageStep = describeDomainAgesForProgress(domainAges);
    if (ageStep) {
      addStep(ageStep);
    }
    const clusterStep = describeCertClustersForProgress(certClusters);
    if (clusterStep) {
      addStep(clusterStep);
    }
    if (useRules) {
      signals.push(...newDomainSignals(domainAges), ...certClusterSignals(certClusters));
    }
  }
  meta.signals = signals.map(({ id, severity }) => ({ id, severity }));

  let result: AnalysisResult | null = null;

  if (useLLM) {
    addStep("Menelaah materi dengan model AI");
    const llmStartedAt = Date.now();
    try {
      const { output, usage } = await invokeAnalyzer(
        materialText,
        analysisAttachments,
        material?.visualCues ?? [],
        useRules ? signals : null,
        search
      );
      meta.tokenUsage = usage;
      result = mapModelOutput(output, {
        text: materialText,
        hasImages: analysisAttachments.length > 0,
        search,
        meta,
      });
      steps.push(
        ...(output.analysisSteps ?? [])
          .map((step) => step.trim())
          .filter(Boolean)
          .slice(0, MAX_MODEL_STEPS)
      );
    } catch (error) {
      meta.fallbackReason = error instanceof Error ? error.message : String(error);
      console.error("[Analyzer] Model analysis failed, using rule-based fallback:", meta.fallbackReason);
      addStep("Model AI tidak dapat dijalankan, beralih ke pemeriksaan berbasis aturan");
    } finally {
      meta.timingsMs.llm = Date.now() - llmStartedAt;
    }
  } else {
    meta.fallbackReason = "model disabled";
  }

  if (!result) {
    meta.mode = "rule_fallback";
    result = buildRuleBasedResult(materialText, signals, search);
  }

  if (useRules) {
    const capStep = applyManipulationCap(result, signals, materialText);
    if (capStep) {
      meta.manipulationCapApplied = true;
      steps.push(capStep);
    }
    const floorStep = applyRiskFloor(result, signals);
    if (floorStep) {
      meta.riskFloorApplied = true;
      steps.push(floorStep);
    }
  }

  // Only under a verdict: without a posting to judge, the list would describe nothing
  if (result.claims.length) {
    result.checks = buildChecks({
      signals: useRules ? signals : null,
      links,
      search: useSearch ? search : null,
      domainAges,
      certClusters,
    });
  }

  return finish(result);
}
