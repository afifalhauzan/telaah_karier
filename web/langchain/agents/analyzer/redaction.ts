// Masks the applicant's own secrets before chat text reaches a model, and before anything is
// published to TelaahBareng (design doc 6.3).
// Posting data (contact numbers, accounts, domains, salaries) is deliberately left intact: shared
// numbers are how other people recognise the same scam.

export const NIK_MASK = "[NIK disensor]";
export const CODE_MASK = "[kode disensor]";

// First two NIK digits are the province code (Kemendagri), which rules out most other 16-digit numbers.
const PROVINCE_CODES = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "21",
  "31", "32", "33", "34", "35", "36",
  "51", "52", "53",
  "61", "62", "63", "64", "65",
  "71", "72", "73", "74", "75", "76",
  "81", "82",
  "91", "92", "93", "94", "95", "96",
]);

// 16 digits, optionally grouped with spaces, dots, or dashes (e.g. "3201 2345 6789 0001").
const NIK_CANDIDATE = /(?<![\d+])\d(?:[ .-]?\d){15}(?![\d])/g;
// 4-6 digits shortly after a code keyword: "kode OTP 482913", "PIN: 1234". "kode pos" is not a secret.
const ONE_TIME_CODE = /\b(kode(?!\s+pos)(?:\s+(?:otp|verifikasi|akses|aktivasi))?|otp|pin|token)\b([^\d\n]{0,20})(\d{4,6})\b/gi;
const PERSONAL_HINT = /\b(tanggal lahir|tgl\.? lahir|ttl|tempat,? tanggal lahir|nama ibu kandung|alamat rumah)\b/i;

function isNik(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  return digits.length === 16 && PROVINCE_CODES.has(digits.slice(0, 2));
}

/** Replaces NIK numbers and one-time codes; everything else is left as written. */
export function redactSensitive(text: string): string {
  return text
    .replace(NIK_CANDIDATE, (match) => (isNik(match) ? NIK_MASK : match))
    .replace(ONE_TIME_CODE, (_match, keyword: string, gap: string) => `${keyword}${gap}${CODE_MASK}`);
}

/**
 * Redacts, in place, the text the user wrote in a chat request (every user turn, since earlier turns
 * are sent to the model again as context). Attachments are not touched: images go to the model as is.
 */
export function redactUserMessages(messages: unknown): void {
  if (!Array.isArray(messages)) return;
  for (const message of messages) {
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") message.content = redactSensitive(message.content);
    for (const part of Array.isArray(message.parts) ? message.parts : []) {
      if (part?.type === "text" && typeof part.text === "string") part.text = redactSensitive(part.text);
    }
  }
}

/** True when the text still holds something redactSensitive would mask. */
export function hasSensitiveData(text: string): boolean {
  return redactSensitive(text) !== text;
}

/**
 * Lines that probably describe the applicant (masked NIK, birth date, mother's name, home address).
 * Not masked automatically, since names and addresses cannot be told apart reliably; the post form
 * warns about them instead.
 */
export function looksLikePersonalData(text: string): boolean {
  return text.includes(NIK_MASK) || PERSONAL_HINT.test(text) || hasSensitiveData(text);
}

/** Drops the query string and fragment, which often carry tokens or tracking ids. */
export function stripUrlQuery(url: string): string {
  return url.replace(/[?#].*$/, "");
}
