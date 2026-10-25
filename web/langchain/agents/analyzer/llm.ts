import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

// Upper bound for one model call. With retries on, a provider outage would otherwise stall the
// request for a long time before the rule-based fallback can answer.
export const LLM_TIMEOUT_MS = 45_000;
const LLM_MAX_RETRIES = 2;

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

/** Token counts from the raw model message returned by withStructuredOutput({ includeRaw: true }). */
export function readTokenUsage(raw: unknown): TokenUsage | undefined {
  const usage = (raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } })
    ?.usage_metadata;
  if (!usage) {
    return undefined;
  }
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    total: usage.total_tokens ?? 0,
  };
}

export type ModelStage = "analysis" | "extraction" | "router" | "follow_up" | "action" | "title" | "card";

// Each pipeline stage can run on its own Gemini model, e.g. GEMINI_ROUTER_MODEL=gemini-2.5-flash-lite,
// so stages can be compared and tuned independently during evaluation.
const STAGE_MODEL_ENV: Record<ModelStage, string> = {
  analysis: "GEMINI_ANALYSIS_MODEL",
  extraction: "GEMINI_EXTRACTION_MODEL",
  router: "GEMINI_ROUTER_MODEL",
  follow_up: "GEMINI_FOLLOW_UP_MODEL",
  action: "GEMINI_ACTION_MODEL",
  title: "GEMINI_TITLE_MODEL",
  card: "GEMINI_CARD_MODEL",
};
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Gemini model for a stage: stage override, then GEMINI_MODEL, then the default. */
export function geminiModelFor(stage?: ModelStage): string {
  return (stage && process.env[STAGE_MODEL_ENV[stage]]) || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/**
 * Factory for chat model instances. An explicit modelName wins; otherwise the model comes from
 * the stage's env override, then GEMINI_MODEL / OPENAI_MODEL.
 */
export function getLLMModel(options?: { temperature?: number; modelName?: string; stage?: ModelStage }): BaseChatModel {
  const temperature = options?.temperature ?? 0.2;

  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const defaultGeminiModel = options?.modelName || geminiModelFor(options?.stage);
  const defaultOpenAIModel = options?.modelName || process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (geminiApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey,
      model: defaultGeminiModel,
      temperature,
      maxOutputTokens: 8192,
      maxRetries: LLM_MAX_RETRIES,
      // Gemini 2.5 models spend part of maxOutputTokens on internal "thinking" by default,
      // which can starve the actual JSON answer and cause truncated/unparsable structured output
      // (especially with image input, which increases thinking usage). Disable it since we don't
      // need chain-of-thought here — the schema's own "analysisSteps" field already covers that.
      thinkingConfig: { thinkingBudget: 0 },
    });
  }

  if (openaiApiKey) {
    return new ChatOpenAI({
      apiKey: openaiApiKey,
      model: defaultOpenAIModel,
      temperature,
      maxTokens: 8192,
      maxRetries: LLM_MAX_RETRIES,
    });
  }

  console.warn(
    "[LLM Factory] Neither GOOGLE_GENERATIVE_AI_API_KEY/GEMINI_API_KEY nor OPENAI_API_KEY was found in environment variables. Falling back to default Gemini config."
  );

  return new ChatGoogleGenerativeAI({
    model: defaultGeminiModel,
    temperature,
    maxOutputTokens: 8192,
    maxRetries: LLM_MAX_RETRIES,
    thinkingConfig: { thinkingBudget: 0 },
  });
}
