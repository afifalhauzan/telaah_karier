import { namedBrands } from "../lookalike";
import type { DetectedSignal, SignalId } from "../signals";
import { registrableDomain } from "./domain-age";
import { GENERIC_NAME_WORDS, normalizeForMatch, tavilySearch, type SearchEntity } from "./tavily-search";

// The company's own word against the posting: its site says it never charges applicants or recruits
// over WhatsApp, and the posting does exactly that. Pemeriksa fakta close most impersonation cases
// this way (45 of 466 cases quote such a statement), so it is searched only when the posting uses a
// channel or a fee a statement could deny.

export type Denial = "biaya" | "chat" | "email" | "kanal";

export interface OfficialStatement {
  company: string;
  url: string;
  title: string;
  quote: string;
  // What the statement denies that the posting does
  conflicts: Denial[];
}

const DENIALS: Array<[Denial, RegExp]> = [
  ["biaya", /\btidak\s+(?:pernah\s+)?(?:memungut|meminta|menarik|mengenakan|membebankan)\s+(?:biaya|uang|pembayaran|imbalan|dana)\b|\btidak\s+(?:dipungut|dikenakan)\s+biaya\b/i],
  ["chat", /\btidak\s+(?:pernah\s+)?(?:melakukan\s+|membuka\s+|menyebarkan\s+)?(?:rekrutmen|perekrutan|penerimaan|lowongan|seleksi|informasi\s+lowongan)\b[^.!?\n]{0,60}?\b(?:whatsapp|wa|telegram|pesan\s+pribadi)\b/i],
  ["email", /\btidak\s+(?:pernah\s+)?(?:menggunakan|memakai)\s+(?:alamat\s+)?e-?mail\s+(?:selain|gratis|pribadi|gmail|yahoo)|\bhanya\s+(?:menggunakan|melalui)\s+(?:alamat\s+)?e-?mail\s+(?:resmi|berdomain|@)/i],
  [
    "kanal",
    // "hanya melalui situs resmi", "exclusively through its official online recruitment platform",
    // "tidak melakukan korespondensi terkait rekrutmen" (PLN)
    /\b(?:hanya|exclusively|only)\b[^.!?\n]{0,40}?\b(?:melalui|lewat|di|pada|through|via|on)\b[^.!?\n]{0,30}?\b(?:situs|website|laman|portal|platform|kanal|akun|media\s+sosial)\s+(?:resmi|official)\b|\b(?:hanya|exclusively|only)\b[^.!?\n]{0,40}?\b(?:through|via|on)\s+(?:its|our|the)\s+official\b|\btidak\s+(?:pernah\s+)?(?:melakukan\s+korespondensi|menghubungi\s+(?:pelamar|peserta|kandidat))\b/i,
  ],
];

// The posting's signals each denial contradicts
const CONTRADICTED_BY: Record<Denial, SignalId[]> = {
  biaya: ["fee_request"],
  chat: ["personal_chat_contact"],
  email: ["free_email_domain"],
  kanal: ["personal_chat_contact", "free_email_domain", "unofficial_domain", "throwaway_subdomain", "lookalike_domain"],
};

/** What a statement would have to deny for this posting to contradict it. */
export function deniableKinds(signals: DetectedSignal[]): Denial[] {
  return (Object.keys(CONTRADICTED_BY) as Denial[]).filter((kind) => signals.some((signal) => CONTRADICTED_BY[kind].includes(signal.id)));
}

/** The sentence around each denial in a page snippet, with what it denies. */
export function findDenials(snippet: string): Array<{ kind: Denial; quote: string }> {
  return DENIALS.flatMap(([kind, pattern]) => {
    const match = snippet.match(pattern);
    if (!match || match.index === undefined) return [];
    const start = Math.max(snippet.lastIndexOf(". ", match.index) + 1, 0);
    const end = snippet.indexOf(".", match.index + match[0].length);
    return [{ kind, quote: snippet.slice(start, end < 0 ? undefined : end + 1).trim() }];
  });
}

/**
 * Whether a host is the company's own: its registered domain is the company's name or acronym
 * ("komatsu.co.id" for PT Komatsu Indonesia). A scam site rarely carries the bare name, and a
 * statement denying its own channel would not be on one.
 */
export function isCompanyHost(host: string, entity: SearchEntity): boolean {
  const label = registrableDomain(host)?.split(".")[0];
  if (!label) return false;
  const words = normalizeForMatch(entity.name)
    .trim()
    .split(" ")
    .filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word) && word !== "pt" && word !== "cv");
  return label === words.join("") || words.includes(label) || label === entity.acronym?.toLowerCase();
}

/**
 * Searches the company's own pages for a statement that denies the posting's fee or channel.
 * Listed brands are searched on their known domains; other companies on any site, kept only from
 * a host carrying the company's name.
 */
export async function lookupOfficialStatement(text: string, entity: SearchEntity | undefined, signals: DetectedSignal[]): Promise<OfficialStatement | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  const kinds = deniableKinds(signals);
  const brand = namedBrands(text)[0];
  const company = brand ? { name: brand.name, official: brand.official } : entity?.kind === "company" ? { name: entity.name, official: null } : null;
  if (!apiKey || !kinds.length || !company) return null;

  try {
    const results = await tavilySearch(apiKey, {
      query: `${company.name} waspada penipuan rekrutmen tidak memungut biaya`,
      ...(company.official ? { include_domains: company.official } : {}),
    });
    for (const result of results) {
      const host = new URL(result.url).hostname;
      const official = company.official
        ? company.official.some((domain) => host === domain || host.endsWith(`.${domain}`))
        : isCompanyHost(host, entity!);
      if (!official) continue;
      const denials = findDenials(result.snippet).filter((item) => kinds.includes(item.kind));
      if (denials.length) {
        return { company: company.name, url: result.url, title: result.title, quote: denials[0].quote, conflicts: denials.map((item) => item.kind) };
      }
    }
    return null;
  } catch (error) {
    console.error("[OfficialStatement] search failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

const CONFLICT_TEXT: Record<Denial, string> = {
  biaya: "meminta biaya dari pelamar",
  chat: "merekrut lewat WhatsApp atau Telegram",
  email: "memakai email di luar domain resmi",
  kanal: "memakai kanal di luar situs resminya",
};

export function describeStatementForProgress(statement: OfficialStatement | null): string | null {
  return statement ? `Menemukan pernyataan resmi ${statement.company} yang membantah cara rekrutmen di materi` : null;
}

export function conflictText(statement: OfficialStatement): string {
  return statement.conflicts.map((kind) => CONFLICT_TEXT[kind]).join(" dan ");
}
