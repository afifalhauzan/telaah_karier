/**
 * Checks for the TelaahBareng redaction (langchain/agents/analyzer/redaction.ts): the applicant's
 * NIK and one-time codes are masked, posting data is not.
 *
 *   pnpm test:redaction
 */
import { describe, expect, it } from "vitest";
import { hasSensitiveData, looksLikePersonalData, redactSensitive, redactUserMessages, stripUrlQuery } from "../langchain/agents/analyzer/redaction";
import { preprocessJobInput } from "../langchain/agents/analyzer/preprocessor";
import { detectSignals } from "../langchain/agents/analyzer/signals";

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

it("strips query strings from links", () => {
  expect(stripUrlQuery("https://contoh.example/daftar?token=abc#x")).toBe("https://contoh.example/daftar");
});

describe("masking before the models (chat pipeline, first step)", () => {
  it("masks the user's text in every user message and leaves the rest", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "Saya diminta NIK 3201234567890001" }, { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" }] },
      { role: "assistant", parts: [{ type: "text", text: "Jangan kirim kode OTP 482913 ke siapa pun." }] },
      { role: "user", content: "Mereka minta kode OTP 482913, aman nggak?" },
    ];
    redactUserMessages(messages);
    expect(messages[0].parts?.[0]).toEqual({ type: "text", text: "Saya diminta NIK [NIK disensor]" });
    expect(messages[0].parts?.[1]).toEqual({ type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" });
    // Only what the user typed: assistant text is the model's own output
    expect(messages[1].parts?.[0].text).toBe("Jangan kirim kode OTP 482913 ke siapa pun.");
    expect(messages[2].content).toBe("Mereka minta kode OTP [kode disensor], aman nggak?");
  });

  it("ignores a body without messages or with malformed ones", () => {
    expect(() => redactUserMessages(undefined)).not.toThrow();
    expect(() => redactUserMessages([null, "x", { role: "user", parts: [null, { type: "text" }] }])).not.toThrow();
  });

  it("masks the text the pipeline analyzes, wherever it is called from", () => {
    const { cleanedText, rawInput } = preprocessJobInput("Lowongan admin. Kirim NIK 3201234567890001 dan kode OTP 482913 ke WA 0812-0000-4471");
    expect(cleanedText).toBe("Lowongan admin. Kirim NIK [NIK disensor] dan kode OTP [kode disensor] ke WA 0812-0000-4471");
    expect(rawInput).toContain("3201234567890001");
  });

  it("keeps the rule signals that read the request, not the code itself", () => {
    const text = "Lowongan admin gudang. Kirimkan kode OTP 482913 yang masuk ke HP kamu untuk verifikasi.";
    const masked = preprocessJobInput(text).cleanedText;
    const ids = (signals: ReturnType<typeof detectSignals>) => signals.map((signal) => signal.id).sort();
    expect(masked).not.toContain("482913");
    expect(ids(detectSignals(masked))).toEqual(ids(detectSignals(text)));
    expect(ids(detectSignals(masked))).toContain("sensitive_data_request");
  });
});
});
