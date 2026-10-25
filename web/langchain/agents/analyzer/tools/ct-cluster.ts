import { isOfficialHost, lookalikeFor } from "../lookalike";
import { registrableDomain } from "./domain-age";

// The other sites on a posting's domain, from Certificate Transparency: every HTTPS certificate is
// logged publicly with the host names it covers. One scam operation often runs many fake recruitment
// sites under one domain ("recruitment-buma.aply.my.id", "pt-timah-tbk.open-rekrutmen.aply.my.id"),
// or rotates short random subdomains to outrun blocking ("h7.daftar-segera.site", "xa1.…"), and the
// logs show it before the first fact-check does.
// shortcut: Cert Spotter (SSLMate) lists only certificates that have not expired, which is what a live
// posting has; crt.sh keeps the full history but is too slow and unreliable for a chat answer.

const CT_TIMEOUT_MS = 6000;
const MAX_DOMAINS = 2;
// A full page of issuances means an established domain with many services, not a scam operation
const LARGE_ISSUANCES = 100;
const RECRUITMENT_WORDS =
  /(rekrut|recrut|recruit|loker|lowongan|daftar|dftar|pendaftaran|karir|karier|career|hiring|seleksi|magang|vacanc|jobs?\b)/i;
// "h7", "xa1", "w3": throwaway names for rotating one scam page across many addresses
const ROTATION_LABEL = /^[a-z]{1,3}\d{1,3}$/;
const MAX_EXAMPLES = 4;

export interface CertCluster {
  domain: string;
  status: "ok" | "large" | "error";
  // Distinct host names under the domain in the logs
  hostCount: number;
  // Host names that read as recruitment sites
  recruitmentHosts: string[];
  // Short throwaway subdomains, when the domain itself or its sites are about recruitment
  rotationHosts: string[];
  // Employers whose name is dressed up in a host under the domain (lookalike.ts)
  imitatedBrands: string[];
  // Earliest certificate still listed, as an ISO date
  firstSeen: string | null;
}

export interface CertEntry {
  dns_names?: string[];
  not_before?: string;
}

const empty = (domain: string, status: CertCluster["status"], hostCount = 0): CertCluster => ({
  domain,
  status,
  hostCount,
  recruitmentHosts: [],
  rotationHosts: [],
  imitatedBrands: [],
  firstSeen: null,
});

/** What the log entries say about a domain. Pure, so it can be tested on recorded entries. */
export function summarizeCertEntries(domain: string, entries: CertEntry[]): CertCluster {
  if (entries.length >= LARGE_ISSUANCES) return empty(domain, "large", entries.length);

  const hosts = new Set<string>();
  let firstSeen: string | null = null;
  for (const entry of entries) {
    for (const name of entry.dns_names ?? []) {
      const host = name.trim().toLowerCase().replace(/^\*\./, "").replace(/^www\./, "");
      if (host && (host === domain || host.endsWith(`.${domain}`))) hosts.add(host);
    }
    const date = entry.not_before?.slice(0, 10);
    if (date && (!firstSeen || date < firstSeen)) firstSeen = date;
  }

  // The part before the domain is what the operator named; the domain itself is judged elsewhere
  const sub = (host: string) => host.slice(0, -domain.length).replace(/\.$/, "");
  const subdomains = [...hosts].filter((host) => host !== domain).sort();
  const recruitmentHosts = subdomains.filter((host) => RECRUITMENT_WORDS.test(sub(host)));
  const aboutRecruitment = RECRUITMENT_WORDS.test(domain) || recruitmentHosts.length > 0;
  const rotationHosts = aboutRecruitment ? subdomains.filter((host) => ROTATION_LABEL.test(sub(host))) : [];
  const imitatedBrands = [...new Set(subdomains.flatMap((host) => lookalikeFor(host)?.brand ?? []))];
  return { domain, status: "ok", hostCount: hosts.size, recruitmentHosts, rotationHosts, imitatedBrands, firstSeen };
}

async function lookupCertCluster(domain: string): Promise<CertCluster> {
  try {
    const key = process.env.CERTSPOTTER_API_KEY;
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TelaahKarier/1.0 (+https://telaahkarier.com)",
        // Optional: without a key the API allows a smaller hourly quota
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(CT_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Cert Spotter HTTP ${response.status}`);
    const entries = (await response.json()) as CertEntry[];
    return summarizeCertEntries(domain, Array.isArray(entries) ? entries : []);
  } catch (error) {
    console.error(`[CertCluster] ${domain}:`, error instanceof Error ? error.message : error);
    return empty(domain, "error");
  }
}

/** Looks up the first few distinct registered domains among the hosts, except official ones. */
export async function lookupCertClusters(hosts: string[]): Promise<CertCluster[]> {
  const domains = [...new Set(hosts.flatMap((host) => registrableDomain(host) ?? []))]
    .filter((domain) => !isOfficialHost(domain))
    .slice(0, MAX_DOMAINS);
  return Promise.all(domains.map(lookupCertCluster));
}

/** A domain that poses as several employers, hosts a row of recruitment sites, or rotates addresses. */
export function isSuspiciousCluster(cluster: CertCluster): boolean {
  return (
    cluster.status === "ok" &&
    (cluster.imitatedBrands.length >= 2 || cluster.recruitmentHosts.length >= 3 || cluster.rotationHosts.length >= 4)
  );
}

/** The hosts that make the cluster suspicious, for the evidence and the checklist. */
export function clusterExamples(cluster: CertCluster): string[] {
  const shown = cluster.recruitmentHosts.length >= cluster.rotationHosts.length ? cluster.recruitmentHosts : cluster.rotationHosts;
  return shown.slice(0, MAX_EXAMPLES);
}

export function describeCertClustersForProgress(clusters: CertCluster[]): string | null {
  if (!clusters.length) return null;
  const parts = clusters.map((cluster) => {
    if (cluster.status === "error") return `${cluster.domain} tidak dapat diperiksa`;
    if (cluster.status === "large") return `${cluster.domain} domain besar dengan banyak layanan`;
    return isSuspiciousCluster(cluster)
      ? `${cluster.domain} memuat ${cluster.hostCount} situs, termasuk ${clusterExamples(cluster).join(", ")}`
      : `${cluster.domain} tidak memuat deretan situs rekrutmen lain`;
  });
  return `Memeriksa log sertifikat (Certificate Transparency): ${parts.join("; ")}`;
}
