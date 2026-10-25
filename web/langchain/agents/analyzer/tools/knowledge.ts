// Relative paths: eval scripts run this through jiti, which does not resolve the "@/" alias.
import { backendFetch, internalKeyHeader } from "../../../../lib/server-auth";
import { findContacts } from "../../telaah-bersama/identifiers";
import { socialHandles, type CaseCard, type KnowledgeIdentifier } from "../../knowledge/case-card";
import { embedTexts } from "../../knowledge/embedding";
import type { SearchSource } from "./tavily-search";

// "Masa lalu": the knowledge base of fact-checked job scams (TurnBackHoax and partner media, synced
// nightly). Two kinds of knowledge with different weight:
//   - the same phone, account, domain, or spreading account as a debunked case: the same operation,
//     a rule signal that sets the verdict's floor;
//   - similar cases by meaning: context only (who is often impersonated, the official channel).
//     A genuine BCA internship is close to the BCA scams, so similarity is never evidence.

const KNOWLEDGE_TIMEOUT_MS = 6000;
// Cases reached through the network beyond the direct matches are summarised, not listed
const MAX_IDENTITY_SOURCES = 3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export interface KnowledgeCase {
  id: number;
  url: string;
  title: string;
  published_at: string | null;
  card: CaseCard | null;
  identifiers: KnowledgeIdentifier[];
}

export interface KnowledgeResult {
  status: "ok" | "error";
  // The cases sharing an identifier with the posting first (shared filled), then their network
  identity: Array<KnowledgeCase & { shared: KnowledgeIdentifier[] }>;
  similar: Array<KnowledgeCase & { score: number }>;
  entities: Array<{ entity: string; count: number; latest: string | null }>;
}

export interface KnowledgeOptions {
  // Evaluation: the dataset row's own fact-check, so the agent cannot simply remember it
  excludeUrls?: string[];
  excludeAbove?: number;
  // Evaluation: only the cases published before this date (YYYY-MM-DD), as the test set's cutoff
  before?: string;
}

const EMPTY: Omit<KnowledgeResult, "status"> = { identity: [], similar: [], entities: [] };

/** The posting's identifiers the way cases store them. */
export function postingIdentifiers(text: string): KnowledgeIdentifier[] {
  return [...findContacts(text).identifiers, ...socialHandles(text, [text]).map((value) => ({ kind: "social" as const, value }))];
}

/**
 * ownText is the user's own material, the only place identifiers are taken from: a linked job page
 * lists other companies' contacts under "similar jobs". The whole material is embedded.
 */
export async function lookupKnowledge(
  { ownText, materialText }: { ownText: string; materialText: string },
  options: KnowledgeOptions = {}
): Promise<KnowledgeResult> {
  const signal = AbortSignal.timeout(KNOWLEDGE_TIMEOUT_MS);
  try {
    // Without an embedding the shared identifiers still count
    const embedding = await embedTexts([materialText], "RETRIEVAL_QUERY", signal)
      .then(([vector]) => vector)
      .catch(() => null);
    const response = await backendFetch("/knowledge/search", {
      method: "POST",
      headers: internalKeyHeader(),
      body: JSON.stringify({
        identifiers: postingIdentifiers(ownText),
        embedding,
        ...(options.excludeUrls?.length ? { exclude_urls: options.excludeUrls } : {}),
        ...(options.excludeAbove ? { exclude_above: options.excludeAbove } : {}),
        ...(options.before ? { before: options.before } : {}),
      }),
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`knowledge search returned ${response.status}`);
    return { status: "ok", ...EMPTY, ...(await response.json()).data };
  } catch (error) {
    console.error("[Knowledge] Lookup failed:", error instanceof Error ? error.message : error);
    return { status: "error", ...EMPTY };
  }
}

export function formatCaseDate(iso: string | null): string {
  if (!iso) return "tanggal tidak diketahui";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export const identifierLabel = ({ kind, value }: KnowledgeIdentifier) =>
  kind === "social" ? `akun “${value}”` : kind === "phone" ? `nomor ${value}` : kind === "email" ? `email ${value}` : kind === "account" ? `rekening ${value}` : `domain ${value}`;

function caseText(item: KnowledgeCase, entities: KnowledgeResult["entities"], extra: string[]): string {
  const card = item.card;
  const entity = card?.entitas ? entities.find((row) => row.entity === card.entitas!.toLowerCase().trim()) : undefined;
  return [
    ...extra,
    card?.modus.length ? `Modus: ${card.modus.join(", ")}.` : "",
    card?.entitas ? `Mencatut: ${card.entitas}${entity && entity.count > 1 ? ` (dicatut ${entity.count} kali di basis kasus)` : ""}.` : "",
    card?.kanal.length ? `Kanal: ${card.kanal.join(", ")}.` : "",
    card?.ciri.length ? `Ciri: ${card.ciri.join("; ")}.` : "",
    card?.jalurResmi ? `Jalur resmi menurut pemeriksa fakta: ${card.jalurResmi}` : "",
    card?.kutipan ? `Kutipan lowongan palsu: “${card.kutipan}”` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The cases as sources the analysis model can cite, numbered after the web sources, so the
 * existing citation checks and the references list cover them too.
 */
export function knowledgeSources(knowledge: KnowledgeResult, after: number): SearchSource[] {
  const direct = knowledge.identity.filter((item) => item.shared.length).slice(0, MAX_IDENTITY_SOURCES);
  const network = knowledge.identity.filter((item) => !item.shared.length);
  const networkNote = network.length
    ? `Terhubung lewat identitas yang sama dengan ${network.length} kasus lain (${[...new Set(network.flatMap((item) => item.card?.entitas ?? []))].slice(0, 5).join(", ")}).`
    : "";

  const sources = [
    ...direct.map((item, index) => ({
      item,
      title: `Kasus penipuan terverifikasi dengan identitas SAMA (${formatCaseDate(item.published_at)}): ${item.title}`,
      extra: [`Identitas yang sama dengan materi: ${item.shared.map(identifierLabel).join(", ")}.`, index === 0 ? networkNote : ""],
    })),
    ...knowledge.similar.map((item) => ({
      item,
      title: `Kasus penipuan terverifikasi yang mirip (${formatCaseDate(item.published_at)}): ${item.title}`,
      extra: [],
    })),
  ];
  return sources.map(({ item, title, extra }, index) => ({
    id: `S${after + index + 1}`,
    title,
    url: item.url,
    snippet: caseText(item, knowledge.entities, extra),
  }));
}

export function describeKnowledgeForProgress(knowledge: KnowledgeResult): string {
  if (knowledge.status === "error") return "Basis kasus terverifikasi tidak dapat diperiksa saat ini";
  const direct = knowledge.identity.filter((item) => item.shared.length);
  if (direct.length) {
    return `Memeriksa basis kasus terverifikasi: ${identifierLabel(direct[0].shared[0])} sudah tercatat di ${knowledge.identity.length} kasus penipuan`;
  }
  return knowledge.similar.length
    ? `Memeriksa basis kasus terverifikasi: ${knowledge.similar.length} kasus serupa ditemukan sebagai konteks`
    : "Memeriksa basis kasus terverifikasi: tidak ada kasus yang mirip";
}
