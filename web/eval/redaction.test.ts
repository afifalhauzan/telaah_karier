/**
 * Checks for the TelaahBareng redaction (langchain/agents/analyzer/redaction.ts): the applicant's
 * NIK and one-time codes are masked, posting data is not.
 *
 *   pnpm test:redaction
 */
import { describe, expect, it } from "vitest";
import {
  hasSensitiveData,
  looksLikePersonalData,
  redactSensitive,
  redactUserMessages,
  stripUrlQuery,
} from "../langchain/agents/analyzer/redaction";

describe("personal data redaction", () => {
it("masks a NIK, plain or grouped", () => {
  expect(redactSensitive("NIK 3201234567890001")).toBe("NIK [NIK disensor]");
  expect(redactSensitive("NIK: 3201 2345 6789 0001.")).toBe("NIK: [NIK disensor].");
});

it("keeps 16-digit numbers that cannot be a NIK", () => {
  // 88 is not a province code: e.g. a virtual account number from the posting
  expect(redactSensitive("VA 8808123456789012")).toBe("VA 8808123456789012");
});

it("masks one-time codes but not postal codes", () => {
  expect(redactSensitive("Kode OTP kamu 482913, jangan bagikan")).toBe("Kode OTP kamu [kode disensor], jangan bagikan");
  expect(redactSensitive("PIN: 1234")).toBe("PIN: [kode disensor]");
  expect(redactSensitive("kode pos 60111")).toBe("kode pos 60111");
});

it("leaves posting data intact", () => {
  const posting = "Transfer Rp1.350.000 ke BRI 0000-01-778899-50-1, WA 0812-0000-4471, gaji 6.000.000, 30 Oktober 2026";
  expect(redactSensitive(posting)).toBe(posting);
  expect(hasSensitiveData(posting)).toBe(false);
});

it("flags lines that probably describe the applicant", () => {
  expect(looksLikePersonalData("NIK [NIK disensor]")).toBe(true);
  expect(looksLikePersonalData("Tempat, tanggal lahir: Malang, 2 Mei 2003")).toBe(true);
  expect(looksLikePersonalData("Posisi: Staff Admin")).toBe(false);
});

it("redacts every user turn of a chat request before it reaches a model", () => {
  const file = { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" };
  const messages: Array<{ role: string; content?: string; parts?: Array<{ type: string; text?: string }> }> = [
    { role: "user", parts: [{ type: "text", text: "NIK saya 3201234567890001, aman?" }] },
    { role: "assistant", parts: [{ type: "text", text: "PIN: 1234" }] },
    { role: "user", parts: [{ type: "text", text: "Kode OTP 482913 diminta HRD" }, file] },
    { role: "user", content: "PIN: 9876" },
  ];
  redactUserMessages(messages);
  expect(messages[0].parts?.[0]).toEqual({ type: "text", text: "NIK saya [NIK disensor], aman?" });
  expect(messages[1].parts?.[0].text).toBe("PIN: 1234");
  expect(messages[2].parts?.[0].text).toBe("Kode OTP [kode disensor] diminta HRD");
  expect(messages[2].parts?.[1]).toEqual(file);
  expect(messages[3].content).toBe("PIN: [kode disensor]");
  expect(() => redactUserMessages(undefined)).not.toThrow();
});

it("strips query strings from links", () => {
  expect(stripUrlQuery("https://contoh.example/daftar?token=abc#x")).toBe("https://contoh.example/daftar");
});
});
