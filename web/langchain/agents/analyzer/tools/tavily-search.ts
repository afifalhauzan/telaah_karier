import type { Citation, Reference } from "../schema";
import type { PreprocessedInput } from "../preprocessor";
import { findContacts, isGenericDomain } from "../../telaah-bersama/identifiers";

export type WebSearchStatus = "ok" | "empty" | "skipped_no_key" | "skipped_no_query" | "error";

export interface SearchSource {
  // "S1", "S2", ... — the only handle the model is allowed to cite.
  id: string;
  title: string;
  url: string;
  snippet: string;
}

// The thing being verified. Only sources that mention it count as evidence.
export interface SearchEntity {
  kind: "company" | "domain";
  name: string;
  acronym?: string;
}

export interface SearchTarget {
  query: string;
  entity: SearchEntity;
  // The site the posting points to, searched on its own for the company's pages there.
  siteDomain?: string;
}

export interface WebSearchResult {
  status: WebSearchStatus;
  entity?: SearchEntity;
  // Results returned by the search engine before the relevance filter.
  retrievedCount: number;
  // Only results that mention the entity, or come from the posting's own site.
  sources: SearchSource[];
  // How many of the sources are pages on the site the posting points to.
  site?: { domain: string; count: number };
}

const SEARCH_TIMEOUT_MS = 8000;
const MAX_RESULTS = 5;
// Across the queries of one search, so the prompt stays short
const MAX_SOURCES = 8;
const PROMPT_SNIPPET_LENGTH = 400;
const UI_SNIPPET_LENGTH = 180;

// Shown when there is no web evidence. Guidance for manual checks only, never cited as evidence.
export const GUIDANCE_REFERENCES: Reference[] = [
  {
    title: "Website & Career Page Resmi Perusahaan",
    snippet:
      "Pastikan lowongan yang sama benar-benar dipublikasikan di kanal resmi perusahaan, bukan hanya di poster/chat forwarding.",
    citations: [],
  },
  {
    title: "LinkedIn Resmi Perusahaan",
    snippet: "Gunakan profil resmi untuk mencocokkan nama perusahaan, aktivitas rekrutmen, dan informasi kontak.",
    url: "https://www.linkedin.com",
    citations: [],
  },
  {
    title: "Portal Karirhub Kemnaker",
    snippet: "Gunakan sebagai salah satu pembanding lowongan resmi dan informasi ketenagakerjaan yang lebih terstruktur.",
    url: "https://karirhub.kemnaker.go.id",
    citations: [],
  },
];

// Domains that say nothing about the employer, so they are useless as a search query.
const NON_EMPLOYER_DOMAINS = [
  "bit.ly", "s.id", "tinyurl.com", "cutt.ly", "shorturl.at", "rb.gy", "linktr.ee", "lnk.bio",
  "wa.me", "whatsapp.com", "t.me", "instagram.com", "facebook.com", "fb.com", "tiktok.com",
  "twitter.com", "x.com", "linkedin.com", "youtube.com", "google.com", "forms.gle",
  // Job boards: the posting is on them, the employer is not
  "jobstreet.co.id", "jobstreet.com", "glints.com", "kalibrr.id", "kalibrr.com", "indeed.com", "karirhub.kemnaker.go.id",
];

// Bare text like "S.Kom" or "Jl.Mawar" also looks like a host; only common employer TLDs count.
// shortcut: fixed TLD list, extend it when a real employer domain is missed.
const EMPLOYER_TLD = /\.(?:id|com|net|org|co|io|group|biz|info|asia|my|sg|tech|ai|app|site|online|careers|jobs)$/;

// Names stay on one line: transcribed letters put the address ("Jl. ...") on the next line.
const COMPANY_PATTERN = /\b(PT|CV)\.?[ \t]+((?:[A-Z0-9][\w&'.-]*[ \t]?){1,6})(?:\(([A-Z]{2,8})\))?/;
// Companies abroad put the legal form after the name ("BLOOMTECH, Inc.", "Maju Jaya Sdn Bhd"):
// remote jobs and the TPPO routes (Malaysia, Singapore) both name them so.
const FOREIGN_COMPANY_PATTERN =
  /((?:\b[A-Z][\w&'-]*[ \t]){0,2}\b[A-Z][\w&'-]*),?[ \t]+(Inc|Ltd|LLC|Corp|Corporation|GmbH|Co\.,?[ \t]*Ltd|Sdn\.?[ \t]*Bhd|Pte\.?[ \t]*Ltd)\b/;
// The words of those legal forms, as normalizeForMatch leaves them
const FOREIGN_FORM_WORDS = new Set(["inc", "ltd", "llc", "corp", "corporation", "gmbh", "co", "sdn", "bhd", "pte"]);
const COMPANY_STOPWORDS = new Set([
  "membuka", "lowongan", "loker", "kerja", "dibutuhkan", "butuh", "mencari", "segera", "hiring",
  "rekrutmen", "recruitment", "karyawan", "posisi", "untuk", "bagian", "job", "vacancy", "sedang",
  "kini", "menerima", "is", "are", "opening", "gaji", "lokasi", "kualifikasi", "syarat",
  "persyaratan", "penempatan", "domisili", "hubungi", "kirim", "daftar", "info", "jl", "jalan",
]);
// Legal suffixes that sources often drop ("PT Bank Central Asia Tbk" vs "PT Bank Central Asia").
const LEGAL_SUFFIXES = new Set(["tbk", "persero"]);
// Words in many company names, so a domain containing one says nothing about whose site it is.
export const GENERIC_NAME_WORDS = new Set(["tbk", "persero", "indonesia", "group", "grup", "global", "international", "nusantara"]);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export function normalizeForMatch(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function extractCompany(text: string): SearchEntity | null {
  const match = text.match(COMPANY_PATTERN);
  if (!match) {
    return extractForeignCompany(text);
  }

  const words: string[] = [];
  for (const word of match[2].trim().split(/\s+/)) {
    const bareWord = word.replace(/[.,;:]+$/, "");
    if (COMPANY_STOPWORDS.has(bareWord.toLowerCase())) {
      break;
    }
    words.push(bareWord);
    // Trailing punctuation ends the name: "PT Sukses Makmur Sentosa. Gaji 6 juta".
    if (bareWord !== word) {
      break;
    }
  }

  if (!words.length) {
    return null;
  }

  return { kind: "company", name: `${match[1].toUpperCase()} ${words.join(" ")}`, acronym: match[3] };
}

function extractForeignCompany(text: string): SearchEntity | null {
  const match = text.match(FOREIGN_COMPANY_PATTERN);
  if (!match) {
    return null;
  }
  // "We are hiring at Acme Inc": the capitalised words before the name are not part of it
  const words = match[1].split(/\s+/);
  while (words.length > 1 && COMPANY_STOPWORDS.has(words[0].toLowerCase())) {
    words.shift();
  }
  return { kind: "company", name: `${words.join(" ")} ${match[2].replace(/\s+/g, " ")}` };
}

/**
 * Finds something in the posting that can actually be verified on the web: the legal company
 * name, else a non-generic employer domain. Without one, searching the posting text only returns
 * generic job-board pages that say nothing about this posting, so no search is done.
 */
export function buildVerificationQuery(preprocessed: PreprocessedInput): SearchTarget | null {
  const company = extractCompany(preprocessed.cleanedText);
  const domains = employerDomains(preprocessed);
  const [employerDomain] = domains;
  if (company) {
    // Only a site that carries the company's name: a job blog reposting it is not the company's
    const nameWords = normalizeForMatch(company.name).trim().split(" ").filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word));
    const siteDomain = domains.find((domain) => nameWords.some((word) => domain.includes(word)));
    return { query: `"${company.name}" lowongan kerja`, entity: company, siteDomain };
  }
  if (employerDomain) {
    // The site search finds what a domain query misses, such as the company's own scam warning
    return { query: employerDomain, entity: { kind: "domain", name: employerDomain }, siteDomain: employerDomain };
  }

  return null;
}

/** Sites the posting points to that could be the employer's own, in the order they appear. */
export function employerDomains(preprocessed: PreprocessedInput): string[] {
  // Posters write sites bare ("idstar.co.id") and often only give an email, so both count
  const { identifiers } = findContacts(preprocessed.cleanedText);
  const domains = [
    ...preprocessed.extractedDomains,
    ...identifiers.filter((item) => item.kind === "domain").map((item) => item.value),
    ...identifiers.filter((item) => item.kind === "email").map((item) => item.value.split("@")[1]),
  ]
    .map((domain) => domain.replace(/^www\./, ""))
    .filter(
      (domain) =>
        EMPLOYER_TLD.test(domain) &&
        !isGenericDomain(domain) &&
        !NON_EMPLOYER_DOMAINS.some((generic) => domain === generic || domain.endsWith(`.${generic}`))
    );
  return [...new Set(domains)];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * A source is evidence only if it is about the same company or domain, judged on its title and
 * URL (snippet-only mentions are mostly listing pages about other companies). A company name must
 * match as a whole: "PT Sukses Makmur Sentosa" must not match "PT Jaya Sukses Makmur Sentosa Tbk".
 */
export function mentionsEntity(source: SearchSource, entity: SearchEntity): boolean {
  const host = hostnameOf(source.url);

  if (entity.kind === "domain") {
    const domain = entity.name.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`) || `${source.title} ${source.snippet}`.toLowerCase().includes(domain);
  }

  const tokens = normalizeForMatch(entity.name).trim().split(" ");
  // "PT Sukses Makmur" leads with its legal form; "Bloomtech Inc" and "Maju Sdn Bhd" end with it
  const foreignForm: string[] = [];
  while (tokens.length > 1 && FOREIGN_FORM_WORDS.has(tokens[tokens.length - 1])) {
    foreignForm.unshift(tokens.pop()!);
  }
  const [legalForm, ...nameTokens] = foreignForm.length ? [foreignForm.join(" "), ...tokens] : tokens;
  while (nameTokens.length && LEGAL_SUFFIXES.has(nameTokens[nameTokens.length - 1])) {
    nameTokens.pop();
  }
  if (!nameTokens.length) {
    return false;
  }

  const phrase = nameTokens.join(" ");
  const compactName = nameTokens.join("");
  const title = normalizeForMatch(source.title);
  const titleAndUrl = normalizeForMatch(`${source.title} ${source.url}`);
  const hostLabels = host.split(".").map((label) => label.replace(/[^a-z0-9]/g, ""));

  return (
    // "... PT Sukses Makmur Sentosa ..." / "... Bloomtech Inc ..." with the legal form next to the name.
    titleAndUrl.includes(foreignForm.length ? ` ${phrase} ${legalForm} ` : ` ${legalForm} ${phrase} `) ||
    // Company sites often title pages without the legal form: "Sukses Makmur Sentosa | Karir".
    title.startsWith(` ${phrase} `) ||
    hostLabels.some((label) => label === compactName || label === `${legalForm}${compactName}`) ||
    Boolean(entity.acronym && titleAndUrl.includes(` ${entity.acronym.toLowerCase()} `))
  );
}

export async function searchWeb(target: SearchTarget | null): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return { status: "skipped_no_key", retrievedCount: 0, sources: [] };
  }
  if (!target) {
    return { status: "skipped_no_query", retrievedCount: 0, sources: [] };
  }

  const { query, entity, siteDomain } = target;

  try {
    const [main, byName, site] = await Promise.all([
      tavilySearch(apiKey, { query }),
      // "lowongan kerja" finds a big company's career pages but steers a small company's search to
      // job pages of other companies; the name alone finds its LinkedIn and job-board profiles
      entity.kind === "company" ? tavilySearch(apiKey, { query: `"${entity.name}"` }).catch(() => []) : [],
      siteDomain
        ? // The site search is extra evidence: its failure must not lose the main results
          tavilySearch(apiKey, { query: `${entity.name} lowongan karir`, include_domains: [siteDomain] }).catch(() => [])
        : [],
    ]);

    const retrieved: Array<Omit<SearchSource, "id">> = [];
    for (const item of [...main, ...byName, ...site]) {
      if (!retrieved.some((source) => source.url === item.url)) {
        retrieved.push(item);
      }
    }

    const onSite = (url: string) => !!siteDomain && mentionsEntity({ id: "", title: "", url, snippet: "" }, { kind: "domain", name: siteDomain });
    // IDs are assigned after filtering so the model only ever sees S1..Sn of relevant sources.
    const sources: SearchSource[] = retrieved
      .filter((item) => mentionsEntity({ id: "", ...item }, entity) || onSite(item.url))
      .slice(0, MAX_SOURCES)
      .map((item, index) => ({ id: `S${index + 1}`, ...item }));

    return {
      status: sources.length ? "ok" : "empty",
      entity,
      retrievedCount: retrieved.length,
      sources,
      site: siteDomain ? { domain: siteDomain, count: sources.filter((source) => onSite(source.url)).length } : undefined,
    };
  } catch (error) {
    console.error("[WebSearch] Tavily request failed:", error instanceof Error ? error.message : error);
    return { status: "error", entity, retrievedCount: 0, sources: [] };
  }
}

export async function tavilySearch(apiKey: string, params: { query: string; include_domains?: string[] }): Promise<Array<Omit<SearchSource, "id">>> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...params,
      search_depth: "basic",
      include_answer: false,
      max_results: MAX_RESULTS,
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error HTTP ${response.status}`);
  }

  const data = await response.json();
  const results: any[] = Array.isArray(data?.results) ? data.results : [];

  return results
    .filter((item) => typeof item?.url === "string" && /^https?:\/\//i.test(item.url))
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      title: cleanText(item.title) || "Sumber web",
      url: item.url,
      snippet: truncate(cleanText(item.content), PROMPT_SNIPPET_LENGTH),
    }));
}

// Source IDs written into the text, "(S1, S2, S3)" or "[S1]"; citations are shown as numbered badges.
// A lone "(S1)" stays: it is also the bachelor's degree ("Minimal Sarjana (S1)").
const SOURCE_ID_LIST = /\s*(?:\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]|\(\s*S\d+(?:\s*[,;]\s*S\d+)+\s*\))/gi;

export function stripSourceIds(text: string): string {
  return text.replace(SOURCE_ID_LIST, "").trim();
}

/** Accepts the forms models produce for a source ID ("S1", "s1", "[S1]", "1") and returns "S1". */
export function normalizeSourceId(id: string): string {
  const match = id.toUpperCase().match(/S?\s*(\d+)/);
  return match ? `S${match[1]}` : id.trim().toUpperCase();
}

export function sourceToCitation(source: SearchSource, sources: SearchSource[]): Citation {
  return {
    id: `src-${source.id}`,
    label: `[${sources.indexOf(source) + 1}]`,
    title: source.title,
    link: source.url,
  };
}

export function sourcesToReferences(sources: SearchSource[]): Reference[] {
  return sources.map((source) => ({
    title: source.title,
    snippet: truncate(source.snippet, UI_SNIPPET_LENGTH),
    url: source.url,
    citations: [sourceToCitation(source, sources)],
  }));
}

export function describeSearchForProgress(result: WebSearchResult): string {
  const target = result.entity ? ` "${truncate(result.entity.name, 60)}"` : "";

  switch (result.status) {
    case "ok":
      return `Mencari jejak digital${target} di web: ${result.sources.length} dari ${result.retrievedCount} hasil membahas entitas yang sama`;
    case "empty":
      return `Mencari jejak digital${target} di web: ${result.retrievedCount} hasil ditemukan, tetapi tidak ada yang membahas entitas yang sama`;
    case "skipped_no_key":
      return "Pencarian web dilewati: layanan pencarian belum dikonfigurasi";
    case "skipped_no_query":
      return "Pencarian web dilewati: materi tidak menyebut nama perusahaan atau domain yang bisa diverifikasi";
    case "error":
      return "Pencarian web gagal, analisis dilanjutkan tanpa sumber eksternal";
  }
}
