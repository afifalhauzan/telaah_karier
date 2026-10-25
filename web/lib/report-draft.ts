import type { AnalysisResult, RiskLevel } from "@/langchain/agents/analyzer/schema";

// Checked on each site, 25 Oct 2026: turnbackhoax.id/lapor-hoax, cekfakta.com/contact ("Klik Lapor
// Hoaks"), and the Pasker ID form of Kemnaker.
export const REPORT_CHANNELS = {
  turnbackhoaxEmail: "lapor@turnbackhoax.id",
  turnbackhoaxWhatsapp: "6285921600500",
  cekfaktaWhatsapp: "6281110000579",
  kemnaker: "https://paskerid.kemnaker.go.id/lapor-loker",
  patroliSiber: "https://patrolisiber.id/submit-report/",
  lapor: "https://www.lapor.go.id/",
} as const;

const MAX_POSTING_CHARS = 800;
const MAX_FINDINGS = 4;

export interface ReportDraft {
  // A "tinggi" verdict is reported to the agencies too; a "sedang" one only goes to the fact-checkers to check
  toAgencies: boolean;
  subject: string;
  body: string;
  // The fields of the Kemnaker form, in its order, with what the analysis knows of each
  kemnakerFields: Array<{ label: string; value: string }>;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/** What a report is made of, from a chat analysis or a TelaahBareng post. */
export interface ReportSource {
  level?: RiskLevel;
  company?: string | null;
  findings: string[];
  phones: string[];
  emails: string[];
  links: string[];
  posting: string;
}

export function reportSourceFromAnalysis(analysis: AnalysisResult, postingText: string): ReportSource {
  const entities = analysis.material?.entities;
  return {
    level: analysis.claims[0]?.riskLevel,
    company: entities?.companyNames[0],
    findings: analysis.risks.map((risk) => risk.description),
    phones: entities?.phones ?? [],
    emails: entities?.emails ?? [],
    links: entities?.urls ?? [],
    posting: postingText.trim() || analysis.material?.transcript?.trim() || "",
  };
}

/**
 * A report of the posting, for the user to check and send themselves. Only what the posting shows
 * goes in: the employer it names, its contacts and links, and the findings.
 */
export function buildReportDraft(source: ReportSource, now: Date = new Date()): ReportDraft {
  const { level, links } = source;
  const company = source.company ?? undefined;
  const findings = source.findings.slice(0, MAX_FINDINGS).map((finding) => `- ${finding}`);
  const contacts = [...source.phones, ...source.emails];
  const posting = clip(source.posting.trim(), MAX_POSTING_CHARS);
  const date = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

  const toAgencies = level === "tinggi";
  const subject = `${toAgencies ? "Laporan dugaan lowongan kerja palsu" : "Permintaan cek fakta lowongan kerja"}${company ? ` atas nama ${company}` : ""}`;
  const body = [
    `${subject}.`,
    level ? `Tingkat risiko menurut TelaahKarier: ${level[0].toUpperCase()}${level.slice(1)}.` : "",
    findings.length ? ["Temuan:", ...findings].join("\n") : "",
    contacts.length ? `Kontak yang dipakai: ${contacts.join(", ")}` : "",
    links.length ? `Link yang dipakai: ${links.join(", ")}` : "",
    posting ? `Isi lowongan:\n"${posting}"` : "",
    `Ditelaah dengan TelaahKarier (telaahkarier.com) pada ${date}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    toAgencies,
    subject,
    body,
    kemnakerFields: [
      { label: "Email pelaku", value: source.emails[0] ?? "" },
      { label: "Nama perusahaan yang dipakai", value: company ?? "" },
      { label: "Nomor kontak pelaku", value: source.phones[0] ?? "" },
      { label: "Link informasi", value: links[0] ?? "" },
      { label: "Kronologi singkat", value: [findings.join("\n"), posting ? `Isi lowongan: "${posting}"` : ""].filter(Boolean).join("\n\n") },
    ],
  };
}

export const whatsappLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// Mail clients cut long mailto links, so the body stops at about 1800 characters
export const mailtoLink = (address: string, subject: string, body: string) =>
  `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(clip(body, 1800))}`;
