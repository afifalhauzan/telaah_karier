import { redactSensitive } from "./redaction";

export interface PreprocessedInput {
  rawInput: string;
  cleanedText: string;
  extractedUrls: string[];
  extractedDomains: string[];
  hasSubstantiveContent: boolean;
}

const JOB_SIGNAL_KEYWORDS = [
  "lowongan", "loker", "posisi", "gaji", "perusahaan", "pt ", "cv ",
  "recruiter", "rekrutmen", "hr", "wawancara", "interview", "lamar",
  "job", "vacancy", "hiring", "career", "salary", "wa ", "whatsapp",
];
const MIN_SUBSTANTIVE_LENGTH = 25;

export function preprocessJobInput(input: string): PreprocessedInput {
  const rawInput = input || "";
  // Masked here too, so every caller of the pipeline (chat, evaluation) gets the same first step
  const cleanedText = redactSensitive(rawInput.trim());

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = cleanedText.match(urlRegex) || [];
  const extractedUrls = Array.from(new Set(matches));

  const extractedDomains: string[] = [];
  for (const urlStr of extractedUrls) {
    try {
      extractedDomains.push(new URL(urlStr).hostname.toLowerCase());
    } catch {
      // Invalid URL format, ignore
    }
  }

  const lowerText = cleanedText.toLowerCase();
  const hasJobSignal = JOB_SIGNAL_KEYWORDS.some((keyword) => lowerText.includes(keyword));
  const hasSubstantiveContent =
    extractedUrls.length > 0 || hasJobSignal || cleanedText.length >= MIN_SUBSTANTIVE_LENGTH;

  return {
    rawInput,
    cleanedText,
    extractedUrls,
    extractedDomains,
    hasSubstantiveContent,
  };
}
