import { z } from "zod";
import { getLLMModel } from "../analyzer/llm";
import { findContacts, type Identifier } from "../telaah-bersama/identifiers";
import { embedTexts } from "./embedding";

// One fact-checked job scam as the knowledge base keeps it: a short card the analysis model can read
// and cite, the identifiers that tie it to other cases, and an embedding to find similar postings.
// The model only summarises; identifiers come from rules, and the official channel must be quoted
// from the fact-checker's own explanation, so nothing in a card is invented.

export const MODUS = ["impersonasi", "biaya", "tugas_deposit", "data_sensitif", "tppo", "gaji_tidak_wajar", "lainnya"] as const;

const CardOutputSchema = z.object({
  modus: z.array(z.enum(MODUS)).min(1).max(3).describe("Modus penipuan lowongan ini"),
  entitas: z.string().optional().describe("Perusahaan atau instansi yang dicatut, nama resminya; kosongkan jika tidak ada"),
  kanal: z.array(z.string()).max(4).describe("Kanal penyebaran dan pendaftaran, singkat (mis. 'TikTok', 'link di bio', 'WhatsApp', 'Google Form')"),
  ciri: z.array(z.string()).max(4).describe("Ciri khas lowongan palsu ini, masing-masing maksimal 10 kata"),
  jalurResmi: z
    .string()
    .optional()
    .describe("Kalimat dari Penjelasan/Kesimpulan yang menyebut jalur rekrutmen resmi, disalin persis; kosongkan jika tidak ada"),
});

export type CaseCard = z.infer<typeof CardOutputSchema> & { kutipan: string };

export interface FactCheckArticle {
  title: string;
  postingText: string;
  narrative: string;
  explanation: string | null;
  conclusion: string | null;
  sourceLinks: string[];
}

export type KnowledgeIdentifier = Identifier | { kind: "social"; value: string };

const SYSTEM_PROMPT = `Anda merangkum satu artikel cek fakta tentang lowongan kerja palsu menjadi kartu kasus.
- Isi hanya dari artikel. Jangan menambah fakta, nama, atau angka yang tidak tertulis.
- modus: impersonasi (mencatut perusahaan/instansi), biaya (meminta uang), tugas_deposit (kerja online/tugas berbayar, deposit), data_sensitif (meminta data pribadi, OTP, KTP), tppo (kerja ke luar negeri non-prosedural), gaji_tidak_wajar, lainnya.
- jalurResmi: salin persis kalimat dari Penjelasan atau Kesimpulan yang menyebut kanal rekrutmen resmi (situs, akun, atau cara resmi). Kosongkan jika tidak ada.`;

const KUTIPAN_CHARS = 300;
// Archives and fact-checkers are where the case is documented, not who ran it
const NOT_THE_SCAMMER = ["turnbackhoax.id", "cekfakta.com", "archive.ph", "archive.org", "web.archive.org", "archive.today", "ghostarchive.org"];
const SOCIAL_LINK = /(?:tiktok\.com\/@|instagram\.com\/|facebook\.com\/|x\.com\/|twitter\.com\/|threads\.net\/@)([A-Za-z0-9_.]{3,40})/gi;
// "Akun TikTok “infoloker378” mengunggah…": the narrative names the account that spread it
const NAMED_ACCOUNT = /akun\s+(?:TikTok|Facebook|Instagram|X|Threads|YouTube)\s+[“"]([^”"]{3,60})[”"]/gi;
const NOT_A_HANDLE = new Set(["photo", "video", "watch", "share", "reel", "p", "posts", "groups", "story.php", "permalink.php", "profile.php"]);

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Account handles and names, lowercased without "@", as the posting's spreader. */
export function socialHandles(narrative: string, links: string[]): string[] {
  const handles = new Set<string>();
  for (const match of links.join(" ").matchAll(SOCIAL_LINK)) {
    const handle = match[1].toLowerCase().replace(/\.+$/, "");
    if (!NOT_A_HANDLE.has(handle)) handles.add(handle);
  }
  for (const match of narrative.matchAll(NAMED_ACCOUNT)) handles.add(normalize(match[1]).replace(/^@/, ""));
  return [...handles];
}

/** The identifiers a case is matched on: the scam's own contacts and the accounts that spread it. */
export function caseIdentifiers(article: Pick<FactCheckArticle, "postingText" | "narrative" | "sourceLinks">): KnowledgeIdentifier[] {
  const contacts = findContacts(article.postingText).identifiers.filter(
    (item) => item.kind !== "domain" || !NOT_THE_SCAMMER.some((host) => item.value === host || item.value.endsWith(`.${host}`))
  );
  return [...contacts, ...socialHandles(article.narrative, article.sourceLinks).map((value) => ({ kind: "social" as const, value }))];
}

/** The text a case is embedded by, the same way it was tested against postings. */
export const caseEmbeddingText = (article: Pick<FactCheckArticle, "title" | "postingText">) => `${article.title}\n${article.postingText}`;

export async function buildCaseCard(
  article: FactCheckArticle
): Promise<{ card: CaseCard; identifiers: KnowledgeIdentifier[]; embedding: number[] }> {
  const explanation = [article.explanation, article.conclusion].filter(Boolean).join("\n");
  const llm = getLLMModel({ temperature: 0, stage: "card" }).withStructuredOutput(CardOutputSchema);
  const [output, [embedding]] = await Promise.all([
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Judul: ${article.title}\n\nNarasi:\n${article.narrative}\n\nTeks lowongan:\n${article.postingText}\n\nPenjelasan dan kesimpulan:\n${explanation}`,
      },
    ]),
    embedTexts([caseEmbeddingText(article)], "RETRIEVAL_DOCUMENT"),
  ]);

  return {
    card: {
      ...output,
      // Kept only when it is really in the fact-checker's words
      jalurResmi: output.jalurResmi && normalize(explanation).includes(normalize(output.jalurResmi)) ? output.jalurResmi : undefined,
      kutipan: article.postingText.slice(0, KUTIPAN_CHARS),
    },
    identifiers: caseIdentifiers(article),
    embedding,
  };
}
