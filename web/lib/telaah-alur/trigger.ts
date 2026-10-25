import { COUNTRIES, OTHER, type AlurAnswers, type Flow, type ReadFacts } from "./questions";

// When a chat message says the user is already in a recruitment process ("saya sudah daftar",
// "aku diminta paspor"), the chat offers the TelaahAlur check. Plain rules, no model call: the check
// is offered, never forced, so a missed or extra match only costs a card.

const FIRST_PERSON =
  /\b(saya|aku|gue|gua|gw|kami|anak\s?(saya|ku)|anakku|adik(\s?(saya|ku))?|kakak(\s?(saya|ku))?|suami(\s?(saya|ku))?|istri(\s?(saya|ku))?)\b/i;
// Steps of a process the user is in. Postings say "pelamar diminta membawa KTP" too, which is why
// these count only next to a first-person word.
const IN_PROCESS =
  /\b(sudah|udah|udh|sdh|telah|terlanjur|keburu)\s+(daftar|mendaftar|melamar|apply|ikut\s+tes|tes|interview|wawancara|transfer|tf|bayar|membayar|setor|tanda\s?tangan|ttd|kirim|menyerahkan|serahkan|diterima|lolos)\b|\b(akan|mau|segera|besok|minggu\s+depan)\s+(berangkat|diberangkatkan|dijemput)\b|\b(disuruh|diminta|dimintai)\s+(bayar|transfer|tf|setor|uang|biaya|dp|paspor|ktp|ijazah|data|rekening)\b|\bterlanjur\b|\b(ditampung|penampungan)\b/i;
// Someone who may not be able to leave; offered whatever the wording
const DISTRESS =
  /\b(tidak|nggak|ngga|gak|ga|enggak|gk)\s+(bisa|boleh)\s+(pulang|pergi|keluar|kabur)\b|\bhp\s*(saya|ku|aku)?\s*(disita|diambil|ditahan)\b|\b(paspor|ijazah|ktp)\s*(saya|ku|aku)?\s*(ditahan|dipegang|disita)\b/i;

const FLOW_PATTERNS: Array<[Flow, RegExp]> = [
  ["magang", /\b(magang|internship|ferienjob|program\s+kampus|kerja\s+praktik)\b/i],
  ["remote", /\b(kerja\s+dari\s+rumah|wfh|remote|online|paruh\s+waktu|part\s?time|tugas\s+(like|rating|review)|freelance)\b/i],
  [
    "migran",
    /\b(luar\s+negeri|malaysia|singapura|brunei|taiwan|hong\s?kong|jepang|korea|arab|saudi|dubai|qatar|kuwait|oman|kamboja|myanmar|thailand|bangkok|laos|filipina|vietnam|turki|jerman|australia)\b/i,
  ],
  ["domestik", /\b(luar\s+kota|luar\s+pulau|merantau|kalimantan|sumatra|sumatera|papua|sulawesi|batam|bali|morowali)\b/i],
];

const STAGE_PATTERNS: Array<[string, RegExp]> = [
  ["terjebak", DISTRESS],
  ["sudah_bayar", /\b(transfer|tf|bayar|membayar|setor|serahkan|menyerahkan|tanda\s?tangan|ttd)\b/i],
  ["akan_berangkat", /\b(berangkat|diberangkatkan|dijemput)\b/i],
  ["melamar", /\b(daftar|mendaftar|melamar|apply|tes|interview|wawancara)\b/i],
];

export interface AlurIntent {
  // Core answers read from the message, each with the words it came from
  readFacts: ReadFacts;
}

const readFrom = (text: string, patterns: Array<[string, RegExp]>) => {
  for (const [value, pattern] of patterns) {
    const match = text.match(pattern);
    if (match) return { value, quote: match[0].trim() };
  }
  return null;
};

export function detectAlurIntent(text: string): AlurIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!DISTRESS.test(trimmed) && !(FIRST_PERSON.test(trimmed) && IN_PROCESS.test(trimmed))) return null;

  const readFacts: ReadFacts = {};
  const flow = readFrom(trimmed, FLOW_PATTERNS);
  if (flow) readFacts.jalur = flow;
  const stage = readFrom(trimmed, STAGE_PATTERNS);
  if (stage) readFacts.tahap = stage;
  if (flow?.value === "migran" || flow?.value === "magang") {
    const country = readFrom(trimmed, COUNTRY_PATTERNS);
    if (country) readFacts.negara = country;
  }
  return { readFacts };
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The destination named in the message, by the names the catalog's country search knows
const COUNTRY_PATTERNS: Array<[string, RegExp]> = COUNTRIES.filter((country) => country.value !== OTHER && country.value !== "indonesia").map(
  (country) => [
    country.value,
    new RegExp(`\\b(${[country.label, ...(country.keywords?.split(" ") ?? [])].map(escape).join("|")})\\b`, "i"),
  ]
);

export const answersOf = (readFacts: ReadFacts): AlurAnswers =>
  Object.fromEntries(Object.entries(readFacts).map(([id, fact]) => [id, fact.value]));
