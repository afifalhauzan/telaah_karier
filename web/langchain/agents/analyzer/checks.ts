import type { Check } from "./schema";
import { isOfficialHost } from "./lookalike";
import {
  certClusterSignal,
  formSecretSignal,
  knownScamSignal,
  labelInSentence,
  newDomainSignal,
  telegramFormSignal,
  throwawaySubdomainSignal,
  type DetectedSignal,
} from "./signals";
import { clusterExamples, isSuspiciousCluster, type CertCluster } from "./tools/ct-cluster";
import { domainAgeDays, NEW_DOMAIN_DAYS, registrableDomain, type DomainAge } from "./tools/domain-age";
import { formatCaseDate, identifierLabel, type KnowledgeResult } from "./tools/knowledge";
import type { LinkChecks, TraceStep } from "./tools/link-checks";
import type { WebSearchResult } from "./tools/tavily-search";

// The checklist under the verdict: every check that ran and what it found, built from the
// pipeline's own results (never from the model), so the basis of the verdict is visible.

const DAYS_PER_YEAR = 365;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function patternCheck(signals: DetectedSignal[]): Check {
  // The domain age, the certificate logs, the knowledge base, and the trail's forms have their own lines
  const found = signals.filter((signal) => !["new_domain", "cert_cluster", "known_scam_identity", "form_secret", "form_telegram"].includes(signal.id));
  return found.length
    ? { label: "Pola penipuan umum", status: "warning", detail: `Ditemukan ${found.map(labelInSentence).join(", ")}.` }
    : {
        label: "Pola penipuan umum",
        status: "ok",
        detail: "Tidak ditemukan permintaan biaya, data sensitif, tugas berbayar, atau kanal pendaftaran tersembunyi.",
      };
}

// Asked for in a form, these put the applicant's identity or accounts at stake
const SENSITIVE_ASKS = new Set(["KTP/NIK", "nomor Telegram", "kode verifikasi/OTP", "kata sandi/PIN", "foto selfie/KTP", "nomor rekening"]);
const SECRET_ASKS = new Set(["kode verifikasi/OTP", "kata sandi/PIN", "foto selfie/KTP"]);

const shortUrl = (url: string) => {
  const bare = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return bare.length > 60 ? `${bare.slice(0, 57)}…` : bare;
};

function trailCheck(step: TraceStep): Check {
  const label = `Jejak pendaftaran: ${shortUrl(step.url)}`;
  const asks = step.asks.length ? `, meminta ${step.asks.join(", ")}` : "";
  const sensitive = step.asks.some((item) => SENSITIVE_ASKS.has(item));
  switch (step.outcome) {
    case "form":
      return {
        label,
        status: sensitive ? "warning" : "info",
        detail: `Formulir${step.title ? ` "${step.title}"` : ""} dengan ${step.fields.length} pertanyaan${asks || ", tanpa permintaan data pribadi yang terdeteksi"}.`,
      };
    case "chat":
      return { label, status: "warning", detail: `Pendaftaran berlanjut di chat ${step.title}, bukan kanal resmi perusahaan.` };
    case "login":
      return {
        label,
        status: "info",
        detail:
          step.title === "Google Form"
            ? "Google Form yang hanya bisa dibuka dengan login akun Google, jadi pertanyaannya tidak dapat dibaca otomatis."
            : `Halaman di ${step.title} tertutup login. Kirim screenshot-nya, atau salin link di bio atau tombol daftarnya, agar ikut ditelusuri.`,
      };
    case "unreadable":
      return { label, status: "info", detail: "Halaman tidak dapat dibaca otomatis (sudah mati atau memblokir pembacaan). Tempel isinya di chat agar ikut ditelaah." };
    default:
      return { label, status: sensitive ? "warning" : "ok", detail: `Halaman${step.title ? ` "${step.title}"` : ""} dibaca dan ikut ditelaah${asks}.` };
  }
}

function linkChecks(links: LinkChecks, signals: DetectedSignal[] | null): Check[] {
  const checks: Check[] = links.shortlinks
    .filter(({ destination }) => !destination)
    .map(({ link }) => ({
      label: `Shortlink ${link.replace(/^https?:\/\//, "")}`,
      status: "warning",
      detail: "Tujuannya tidak dapat dibuka otomatis. Jangan isi data apa pun sebelum tahu ke mana link ini mengarah.",
    }));
  checks.push(...links.trail.map(trailCheck));

  // "Link di bio", "klik link": the address is where only the applicant can see it
  if (!links.trail.length && signals?.some((signal) => signal.id === "link_in_bio")) {
    checks.push({
      label: "Link pendaftaran",
      status: "info",
      detail: "Alamat pendaftaran tidak tertulis di materi (link di bio atau tombol). Salin link dari bio atau tombol daftarnya, lalu kirim ke sini agar ditelusuri sampai ke formulirnya.",
    });
  }
  return checks;
}

/** Rule signals from the registration trail: what the form asks, and the shape of its address. */
export function trailSignals(links: LinkChecks): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const secret = links.trail.find((step) => step.asks.some((item) => SECRET_ASKS.has(item)));
  if (secret) signals.push(formSecretSignal(secret.url, secret.asks.filter((item) => SECRET_ASKS.has(item))));
  const telegram = links.trail.find((step) => step.asks.includes("nomor Telegram"));
  if (telegram) signals.push(telegramFormSignal(telegram.url));
  const throwaway = [...new Set(links.trail.map((step) => hostOf(step.url)))].find(isThrowawaySubdomain);
  if (throwaway) signals.push(throwawaySubdomainSignal(throwaway));
  return signals;
}

const RECRUITMENT_LABEL = /rekrut|recruit|loker|lowongan|daftar|pendaftaran|karir|karier|career|hiring|seleksi|magang|kerja/i;

/** A long recruitment-worded subdomain on a domain no employer in our list recruits from. */
export function isThrowawaySubdomain(host: string): boolean {
  const domain = registrableDomain(host);
  if (!domain || domain === host || isOfficialHost(host)) return false;
  const sub = host.slice(0, -domain.length - 1);
  return sub.replace(/[.-]/g, "").length >= 12 && RECRUITMENT_LABEL.test(sub);
}

function searchCheck(search: WebSearchResult): Check {
  const label = "Jejak di web";
  const name = search.entity?.name;
  switch (search.status) {
    case "ok": {
      const onSite = search.site?.count ? `, ${search.site.count} di antaranya dari situs ${search.site.domain}` : "";
      return { label, status: "ok", detail: `${search.sources.length} sumber membahas ${name}${onSite}.` };
    }
    case "empty":
      return { label, status: "info", detail: `Pencarian ${name} tidak menemukan sumber yang membahasnya.` };
    case "skipped_no_query":
      return { label, status: "skipped", detail: "Materi tidak menyebut nama perusahaan berbadan hukum (PT, CV, Inc, Ltd, dan sejenisnya) atau situs yang bisa dicari." };
    case "skipped_no_key":
    case "error":
      return { label, status: "skipped", detail: "Pencarian web sedang tidak tersedia." };
  }
}

function domainAgeCheck({ domain, registeredAt }: DomainAge, now: Date): Check {
  const label = `Umur domain ${domain}`;
  if (!registeredAt) {
    return { label, status: "skipped", detail: "Tanggal pendaftarannya tidak dapat diperiksa." };
  }

  const days = domainAgeDays(registeredAt, now);
  if (days < NEW_DOMAIN_DAYS) {
    return { label, status: "warning", detail: `Baru didaftarkan ${days} hari lalu (${formatDate(registeredAt)}).` };
  }
  if (days < DAYS_PER_YEAR) {
    return { label, status: "info", detail: `Didaftarkan ${formatDate(registeredAt)}, kurang dari setahun lalu.` };
  }
  return { label, status: "ok", detail: `Terdaftar sejak ${formatDate(registeredAt)}.` };
}

function certClusterCheck(cluster: CertCluster): Check {
  const label = `Situs lain di domain ${cluster.domain}`;
  if (cluster.status === "error") {
    return { label, status: "skipped", detail: "Log sertifikat (Certificate Transparency) tidak dapat diperiksa saat ini." };
  }
  if (cluster.status === "large") {
    return { label, status: "info", detail: "Domain besar dengan banyak layanan, jadi jumlah situsnya tidak menunjukkan apa-apa." };
  }
  if (isSuspiciousCluster(cluster)) {
    const brands = cluster.imitatedBrands.length ? `, atas nama ${cluster.imitatedBrands.join(", ")}` : "";
    const since = cluster.firstSeen ? ` sejak ${formatDate(cluster.firstSeen)}` : "";
    return {
      label,
      status: "warning",
      detail: `Log sertifikat memuat ${cluster.hostCount} situs di domain ini${since}${brands}, termasuk ${clusterExamples(cluster).join(", ")}.`,
    };
  }
  return { label, status: "ok", detail: "Log sertifikat tidak memuat deretan situs rekrutmen lain di domain ini." };
}

const caseEntities = (cases: KnowledgeResult["identity"]) => [...new Set(cases.flatMap((item) => item.card?.entitas ?? []))];

function knowledgeCheck(knowledge: KnowledgeResult): Check {
  const label = "Basis kasus terverifikasi";
  if (knowledge.status === "error") {
    return { label, status: "skipped", detail: "Basis kasus dari pemeriksa fakta tidak dapat diperiksa saat ini." };
  }
  const direct = knowledge.identity.find((item) => item.shared.length);
  if (direct) {
    const entities = caseEntities(knowledge.identity);
    const latest = knowledge.identity.map((item) => item.published_at ?? "").sort().at(-1) || null;
    return {
      label,
      status: "warning",
      detail: `${identifierLabel(direct.shared[0])} tercatat di ${knowledge.identity.length} kasus penipuan yang sudah diverifikasi${
        entities.length ? ` (${entities.slice(0, 4).join(", ")})` : ""
      }, terakhir ${formatCaseDate(latest)}.`,
    };
  }
  if (knowledge.similar.length) {
    const [first] = knowledge.similar;
    return {
      label,
      status: "info",
      detail: `Mirip dengan ${knowledge.similar.length} kasus penipuan terverifikasi, misalnya "${first.title}" (${formatCaseDate(first.published_at)}). Kemiripan bukan bukti; dipakai sebagai konteks.`,
    };
  }
  return { label, status: "ok", detail: "Tidak ada kasus terverifikasi yang mirip atau memakai kontak dan akun yang sama." };
}

export function buildChecks({
  signals,
  links,
  search,
  domainAges,
  certClusters = [],
  knowledge = null,
  now = new Date(),
}: {
  // null when the rules did not run (evaluation ablation); the same for the web checks below.
  signals: DetectedSignal[] | null;
  links: LinkChecks | null;
  search: WebSearchResult | null;
  domainAges: DomainAge[];
  certClusters?: CertCluster[];
  knowledge?: KnowledgeResult | null;
  now?: Date;
}): Check[] {
  return [
    ...(signals ? [patternCheck(signals)] : []),
    ...(links ? linkChecks(links, signals) : []),
    ...(search ? [searchCheck(search)] : []),
    ...domainAges.map((age) => domainAgeCheck(age, now)),
    ...certClusters.map(certClusterCheck),
    ...(knowledge ? [knowledgeCheck(knowledge)] : []),
    ...(signals ? legalChecks(signals) : []),
  ];
}

/** One line per law a "tinggi" signal rests on, so the user sees why the verdict is "tinggi". */
export function legalChecks(signals: DetectedSignal[]): Check[] {
  return signals
    .filter((signal) => signal.floor === "tinggi" && signal.legalBasis)
    .map((signal) => ({ label: `Dasar hukum: ${labelInSentence(signal)}`, status: "warning" as const, detail: signal.legalBasis! }));
}

/** The rule signal when the posting shares an identifier with a debunked case. */
export function knowledgeSignals(knowledge: KnowledgeResult): DetectedSignal[] {
  const direct = knowledge.identity.find((item) => item.shared.length);
  return direct
    ? [knownScamSignal({ identifier: identifierLabel(direct.shared[0]), caseCount: knowledge.identity.length, entities: caseEntities(knowledge.identity) })]
    : [];
}

/** Signals for domains registered too recently to have a track record. */
export function newDomainSignals(domainAges: DomainAge[], now: Date = new Date()): DetectedSignal[] {
  return domainAges.flatMap(({ domain, registeredAt }) => {
    const days = registeredAt ? domainAgeDays(registeredAt, now) : null;
    return days !== null && days < NEW_DOMAIN_DAYS ? [newDomainSignal(domain, days)] : [];
  });
}

/** Signals for domains that host a row of recruitment sites, from the certificate logs. */
export function certClusterSignals(clusters: CertCluster[]): DetectedSignal[] {
  return clusters
    .filter(isSuspiciousCluster)
    .map((cluster) => certClusterSignal(cluster));
}
