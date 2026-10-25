// TelaahKarier's own classifier (ml/), trained from fact-checked job scams and genuine postings
// collected every day. One check line under the verdict, never the verdict: a few hundred
// examples cannot outweigh the rules, the web evidence, and the model reading the whole posting.

const CLASSIFIER_TIMEOUT_MS = 1500;
const MAX_TEXT_CHARS = 20000;
// Above this the model's line warns; below it the line only informs
export const CLASSIFIER_WARNING = 0.7;

export interface ClassifierResult {
  probability: number;
  modelVersion: string;
  trainedOn: { penipuan: number; asli: number } | null;
  // Word n-grams in the posting that pushed the score up the most
  topTerms: string[];
}

/** Null when the service is not running or has no model yet; the analysis goes on without it. */
export async function classifyPosting(text: string): Promise<ClassifierResult | null> {
  const base = process.env.ML_URL || "http://ml:8100";
  try {
    const response = await fetch(`${base}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, MAX_TEXT_CHARS) }),
      signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      probability: number;
      model_version: string;
      trained_on: ClassifierResult["trainedOn"];
      top_terms: string[];
    };
    return { probability: body.probability, modelVersion: body.model_version, trainedOn: body.trained_on, topTerms: body.top_terms ?? [] };
  } catch (error) {
    console.error("[Classifier]", error instanceof Error ? error.message : error);
    return null;
  }
}
