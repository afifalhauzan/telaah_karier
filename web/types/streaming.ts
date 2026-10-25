/**
 * AI SDK v5 Custom Data Types for Streaming
 * Defines type-safe custom data parts for analysis and agentic demo streaming
 */

import type { UIMessage } from 'ai';
import type {
  AnalysisResult,
  Check,
  Citation,
  Claim,
  ExplanationItem,
  KnownCase,
  Reference,
  Reasoning,
  SalaryBenefitAssessment,
  Risk,
} from '@/langchain/agents/analyzer/schema';
import type { ChartEmbedData } from '@/types/chart';
import type { AnalysisAction, UIActionId } from "@/types/ui-actions";
import type { QuotaBlock, QuotaState } from "@/lib/quota";
import type { ReadFacts } from "@/lib/telaah-alur/questions";

export interface InteractiveStepPart {
  stepId: string;
  question: string;
  options: string[];
}

export interface ChoiceSummaryPart {
  stepId: string;
  selection: string;
}

export interface SummaryPartData {
  text: string;
  citations?: Citation[];
}

export interface ActionsPartData {
  actions: AnalysisAction[];
}

export interface ActionInsightPartData {
  actionId: UIActionId;
  title: string;
  points: string[];
}

/** Signed by the chat route under a Sedang/Tinggi verdict; the only way to start a TelaahBareng post. */
export interface TelaahSharePartData {
  payload: string;
  signature: string;
}

/** "Sudah ditelaah sebelumnya": an existing post offered instead of running the analysis. */
export interface SimilarTelaahPartData {
  post: {
    id: number;
    title: string;
    riskLevel: 'sedang' | 'tinggi';
    claim: string;
    summary: string;
    evidence: Risk[];
    analyzedAt: string;
    reactionCount: number;
    commentCount: number;
    topComment: { author: string; body: string } | null;
  };
  reasons: string[];
  differentPeriod: boolean;
  ownSignals: string[];
}

/** New material that looks like another posting than the one this session is about. */
export interface SessionMovePartData {
  previousTitle: string;
}

/** The user said they are already in a recruitment process: the TelaahAlur check is offered. */
export interface AlurCheckPartData {
  // Core answers read from the message, confirmed in the card before anything is asked
  readFacts: ReadFacts;
}

export type MetabotUIMessagePart =
  | { type: 'text'; text: string }
  | {
      type: 'file';
      mediaType: string;
      filename?: string;
      url: string;
      providerMetadata?: Record<string, any>;
    }
  | { type: 'data-analysis'; data: AnalysisResult | string }
  | { type: 'data-chart'; data: string | ChartEmbedData }
  | { type: 'data-summary'; data: string | SummaryPartData }
  | { type: 'data-claims'; data: Claim[] }
  | { type: 'data-known-scam'; data: KnownCase[] }
  | { type: 'data-salary-benefit'; data: SalaryBenefitAssessment }
  | { type: 'data-risks'; data: Risk[] }
  | { type: 'data-checks'; data: Check[] }
  | { type: 'data-explanation'; data: ExplanationItem[] }
  | { type: 'data-references'; data: Reference[] }
  | { type: "data-actions"; data: ActionsPartData }
  | { type: "data-action-insight"; data: ActionInsightPartData }
  | { type: 'data-suggested-questions'; data: string[] }
  | { type: 'data-reasoning'; data: Reasoning[] }
  | { type: 'data-telaah-share'; data: TelaahSharePartData }
  | { type: 'data-similar-telaah'; data: SimilarTelaahPartData }
  | { type: 'data-session-move'; data: SessionMovePartData }
  | { type: 'data-alur-check'; data: AlurCheckPartData }
  | { type: 'data-session-title'; data: { title: string } }
  // A turn the quota did not let through (lib/quota.ts); the card offers the way on
  | { type: 'data-quota'; data: { reason: QuotaBlock; state: QuotaState | null } }
  // Transient, after every answer: never stored in a message
  | { type: 'data-quota-state'; data: QuotaState }
  | {
      type: 'data-notification';
      data: {
        message: string;
        level: 'info' | 'warning' | 'error' | 'success';
      };
    }
  | {
      type: 'interactive-step';
      data: InteractiveStepPart;
    }
  | {
      type: 'choice-summary';
      data: ChoiceSummaryPart;
    };

// Define our custom UIMessage type for analysis and interactive parts
export type MetabotUIMessage = Omit<UIMessage<any, any>, 'parts'> & {
  parts: MetabotUIMessagePart[];
};

// Type guard for notification parts
export function hasNotificationPart(message: MetabotUIMessage): boolean {
  if (!message.parts || !Array.isArray(message.parts)) {
    return false;
  }
  
  return message.parts.some(part => 
    part.type === 'data-notification' && 
    part.data && 
    typeof part.data === 'object' &&
    'message' in part.data
  );
}

// Extract notification from message parts
export function extractNotificationFromMessage(message: MetabotUIMessage): { message: string; level: string } | null {
  if (!message.parts || !Array.isArray(message.parts)) {
    return null;
  }
  
  for (const part of message.parts) {
    if (part.type === 'data-notification' && part.data) {
      return part.data as { message: string; level: string };
    }
  }
  
  return null;
}

export function hasInteractiveStepPart(message: MetabotUIMessage): boolean {
  if (!message.parts || !Array.isArray(message.parts)) {
    return false;
  }

  return message.parts.some(part => part.type === 'interactive-step');
}

export function getChoiceSummaryForStep(message: MetabotUIMessage, stepId: string): string | null {
  if (!message.parts || !Array.isArray(message.parts)) {
    return null;
  }

  const choicePart = message.parts.find(part => part.type === 'choice-summary' && part.data.stepId === stepId);
  return choicePart?.type === 'choice-summary' ? choicePart.data.selection : null;
}
