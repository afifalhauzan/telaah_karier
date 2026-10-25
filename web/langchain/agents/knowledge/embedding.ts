// Text embeddings for the knowledge base, from Gemini's embedding model over REST (no SDK needed).
// Cases are embedded once when they enter the base, a posting once per analysis.

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const BATCH = 100;
const MAX_CHARS = 6000;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(texts: string[], task: EmbeddingTask, signal?: AbortSignal): Promise<number[][]> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("No Gemini API key for embeddings");

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH) {
    const requests = texts.slice(start, start + BATCH).map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: text.slice(0, MAX_CHARS) }] },
      taskType: task,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ requests }),
      signal,
    });
    if (!response.ok) throw new Error(`Embedding HTTP ${response.status}`);
    const { embeddings } = (await response.json()) as { embeddings: Array<{ values: number[] }> };
    vectors.push(...embeddings.map((item) => item.values));
  }
  return vectors;
}
