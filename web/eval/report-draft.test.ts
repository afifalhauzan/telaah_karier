/**
 * The report drafted from an analysis (lib/report-draft.ts).
 *
 *   npx jiti eval/report-draft.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { AnalysisSchema } from "../langchain/agents/analyzer/schema";
import { buildReportDraft as build, mailtoLink, REPORT_CHANNELS, reportSourceFromAnalysis, whatsappLink } from "../lib/report-draft";
import type { AnalysisResult } from "../langchain/agents/analyzer/schema";

const buildReportDraft = (analysis: AnalysisResult, posting: string, now?: Date) => build(reportSourceFromAnalysis(analysis, posting), now);

const analysis = AnalysisSchema.parse({
  conversationText: "",
  summary: "Lowongan ini meminta biaya.",
  claims: [{ text: "Tingkat Risiko Awal: Tinggi.", confidence: 0.85, riskLevel: "tinggi" }],
  risks: [{ type: "payment_request", description: "Pelamar diminta membayar biaya pendaftaran Rp 150.000." }],
  material: {
    source: "text",
    entities: { companyNames: ["PT Pertamina (Persero)"], phones: ["0812 3456 7890"], emails: ["hrd.pertamina@gmail.com"], urls: [] },
  },
});

test("the draft names the employer, the findings, and the contacts the posting uses", () => {
  const draft = buildReportDraft(analysis, "LOWONGAN PT PERTAMINA. Biaya pendaftaran Rp 150.000.", new Date("2026-10-25T05:00:00Z"));
  assert.equal(draft.subject, "Laporan dugaan lowongan kerja palsu atas nama PT Pertamina (Persero)");
  assert.match(draft.body, /Tingkat risiko menurut TelaahKarier: Tinggi\./);
  assert.match(draft.body, /- Pelamar diminta membayar biaya pendaftaran/);
  assert.match(draft.body, /Kontak yang dipakai: 0812 3456 7890, hrd\.pertamina@gmail\.com/);
  assert.match(draft.body, /pada 25 Oktober 2026\./);
  assert.deepEqual(
    draft.kemnakerFields.slice(0, 3).map((field) => field.value),
    ["hrd.pertamina@gmail.com", "PT Pertamina (Persero)", "0812 3456 7890"]
  );
});

test("a sedang verdict only asks the fact-checkers to check", () => {
  const sedang = AnalysisSchema.parse({ ...analysis, claims: [{ text: "Tingkat Risiko Awal: Sedang.", confidence: 0.6, riskLevel: "sedang" }] });
  const draft = buildReportDraft(sedang, "");
  assert.equal(draft.toAgencies, false);
  assert.match(draft.subject, /^Permintaan cek fakta lowongan kerja/);
  assert.equal(buildReportDraft(analysis, "").toAgencies, true);
});

test("the links open the user's own app with the draft filled in", () => {
  assert.equal(whatsappLink(REPORT_CHANNELS.cekfaktaWhatsapp, "a b"), "https://wa.me/6281110000579?text=a%20b");
  const mail = mailtoLink(REPORT_CHANNELS.turnbackhoaxEmail, "Laporan", "x".repeat(3000));
  assert.ok(mail.startsWith("mailto:lapor@turnbackhoax.id?subject=Laporan&body="));
  assert.ok(mail.length < 2000);
});
