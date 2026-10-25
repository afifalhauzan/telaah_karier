import type { Check } from "./schema";
import { certClusterSignal, knownScamSignal, labelInSentence, newDomainSignal, type DetectedSignal } from "./signals";
import { clusterExamples, isSuspiciousCluster, type CertCluster } from "./tools/ct-cluster";
import { domainAgeDays, NEW_DOMAIN_DAYS, type DomainAge } from "./tools/domain-age";
import { formatCaseDate, identifierLabel, type KnowledgeResult } from "./tools/knowledge";
import type { LinkChecks } from "./tools/link-checks";
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
  // The domain age, the certificate logs, and the knowledge base have their own lines
  const found = signals.filter((signal) => !["new_domain", "cert_cluster", "known_scam_identity"].includes(signal.id));
  return found.length
    ? { label: "Pola penipuan umum", status: "warning", detail: `Ditemukan ${found.map(labelInSentence).join(", ")}.` }
    : {
        label: "Pola penipuan umum",
        status: "ok",
        detail: "Tidak ditemukan permintaan biaya, data sensitif, tugas berbayar, atau kanal pendaftaran tersembunyi.",
      };
}

function linkChecks(links: LinkChecks): Check[] {
  const checks: Check[] = links.shortlinks.map(({ link, destination }) =>
    destination
      ? { label: `Shortlink ${link.replace(/^https?:\/\//, "")}`, status: "info", detail: `Mengarah ke ${destination}` }
      : {
          label: `Shortlink ${link.replace(/^https?:\/\//, "")}`,
          status: "warning",
          detail: "Tujuannya tidak dapat dibuka otomatis. Jangan isi data apa pun sebelum tahu ke mana link ini mengarah.",
        }
  );

  if (links.page) {
    const host = hostOf(links.page.url);
    checks.push(
      links.page.text
        ? { label: "Isi halaman link", status: "ok", detail: `Halaman di ${host} dibaca dan ikut ditelaah.` }
        : {
            label: "Isi halaman link",
            status: "info",
            detail: `Halaman di ${host} tidak dapat dibaca otomatis. Tempel isi lowongannya di chat agar ikut ditelaah.`,
          }
    );
  }
  return checks;
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
    ...(links ? linkChecks(links) : []),
    ...(search ? [searchCheck(search)] : []),
    ...domainAges.map((age) => domainAgeCheck(age, now)),
    ...certClusters.map(certClusterCheck),
    ...(knowledge ? [knowledgeCheck(knowledge)] : []),
  ];
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
