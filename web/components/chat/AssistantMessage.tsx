import React from "react";
import { type MetabotUIMessage, type MetabotUIMessagePart, type SummaryPartData } from "@/types/streaming";
import { ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { PreviewMessage } from "@/components/message";
import { useInteractionStore } from "@/lib/interaction-store";
import {
  AnalysisSchema,
  type AnalysisResult,
  type Check as AnalysisCheck,
  type Citation,
  type Claim,
  type ExplanationItem,
  type KnownCase,
  type Reference,
  type Reasoning,
  type SalaryBenefitAssessment,
  type Risk,
} from "@/langchain/agents/analyzer/schema";
import { SummaryCard } from "@/components/cards/SummaryCard";
import { ClaimCard } from "@/components/cards/ClaimCard";
import { RiskCard } from "@/components/cards/RiskCard";
import { ChecksCard } from "@/components/cards/ChecksCard";
import { SuggestionQuestions } from "@/components/cards/SuggestionQuestions";
import { ExplanationCard } from "@/components/cards/ExplanationCard";
import { ReferenceCard } from "@/components/cards/ReferenceCard";
import { ReasoningComponent } from "@/components/cards/ReasoningComponent";
import { AnalysisActions } from "@/components/cards/AnalysisActions";
import { ActionInsightCard } from "@/components/cards/ActionInsightCard";
import { SalaryBenefitCard } from "@/components/cards/SalaryBenefitCard";
import { KnownScamCard } from "@/components/cards/KnownScamCard";
import { LinkRequestCard } from "@/components/cards/LinkRequestCard";
import type { AnalysisAction, UIActionId } from "@/types/ui-actions";
import { BuatPostPrompt, SessionMoveCard, SimilarTelaahCard } from "@/components/telaah-bersama/chat-cards";
import { MessageFeedback } from "@/components/chat/message-feedback";
import { QuotaNotice } from "@/components/chat/quota-notice";
import type { QuotaBlock } from "@/lib/quota";
import { MessageActions } from "@/components/chat/MessageActions";
import type { SourceFile } from "@/lib/analysis-export/build";
import type { AlurCheckPartData, SimilarTelaahPartData, TelaahSharePartData } from "@/types/streaming";
import { AlurChatCard } from "@/components/telaah-alur/alur-chat-card";

/** What the user picked on a TelaahBareng card in the chat; handled by components/chat.tsx. */
export type TelaahChoice =
  | { kind: "share"; messageId: string; share: TelaahSharePartData }
  | { kind: "self-analyze"; messageId: string }
  | { kind: "move-session"; messageId: string }
  | { kind: "same-posting"; messageId: string }
  // The session is full: carry its latest analysis into a new one (lib/compact-session.ts)
  | { kind: "continue-session"; messageId: string }
  // The answer to the link request asked before the analysis: the link, or go on without one
  | { kind: "link-given"; messageId: string; url: string }
  | { kind: "skip-link"; messageId: string };

interface AssistantMessageProps {
  message: MetabotUIMessage;
  chatId: string;
  isStreaming: boolean;
  isLastMessage: boolean;
  completedStepSelections: Map<string, string>;
  onInteractiveChoice: (stepId: string, option: string) => void | Promise<void>;
  onSuggestionClick: (suggestion: string) => void;
  onActionClick: (action: AnalysisAction, sourceMessageId?: string) => void;
  pendingActionId?: UIActionId | null;
  // Actions already asked in this session, left out of the chips
  usedActionIds?: Set<UIActionId>;
  isActionLoading?: boolean;
  onTelaahChoice?: (choice: TelaahChoice) => void;
  // Set for saved (signed-in) sessions: answers there can be rated for evaluation.
  feedbackConversationId?: string | null;
  // What the user sent before this answer; goes into the exported document and PDF.
  sourceText?: string;
  sourceFiles?: SourceFile[];
  // Signed-in user's name, used in the line that goes with a shared PDF.
  userName?: string | null;
}

interface SectionalAnalysisData {
  summary?: SummaryPartData;
  claims?: Claim[];
  salaryBenefit?: SalaryBenefitAssessment;
  risks?: Risk[];
  explanations?: ExplanationItem[];
  references?: Reference[];
  actions?: AnalysisAction[];
  actionInsight?: {
    actionId: UIActionId;
    title: string;
    points: string[];
  };
  suggestedQuestions?: string[];
  reasoning?: Reasoning[];
}

type RenderItem =
  | { kind: "preview-full"; key: string }
  | { kind: "preview-part"; key: string; part: MetabotUIMessagePart; partIndex: number }
  | { kind: "reasoning"; key: string; reasoning: Reasoning[] }
  | { kind: "summary"; key: string; summary: string; citations: Citation[] }
  | { kind: "claims"; key: string; claims: Claim[] }
  | { kind: "known-scam"; key: string; cases: KnownCase[] }
  | { kind: "link-request"; key: string }
  | { kind: "salary-benefit"; key: string; assessment: SalaryBenefitAssessment }
  | { kind: "risks"; key: string; risks: Risk[] }
  | { kind: "checks"; key: string; checks: AnalysisCheck[] }
  | { kind: "explanations"; key: string; explanations: ExplanationItem[] }
  | { kind: "references"; key: string; references: Reference[] }
  | { kind: "actions"; key: string; actions: AnalysisAction[] }
  | {
      kind: "action-insight";
      key: string;
      actionInsight: {
        actionId: UIActionId;
        title: string;
        points: string[];
      };
    }
  | { kind: "suggested-questions"; key: string; questions: string[] }
  | { kind: "telaah-share"; key: string; share: TelaahSharePartData }
  | { kind: "similar-telaah"; key: string; data: SimilarTelaahPartData }
  | { kind: "session-move"; key: string; previousTitle: string }
  | { kind: "quota"; key: string; reason: QuotaBlock }
  | { kind: "alur-check"; key: string; data: AlurCheckPartData };

function extractAnalysisFromParts(parts: MetabotUIMessagePart[]): AnalysisResult | null {
  const analysisPart = parts.find((part) => part.type === "data-analysis");

  if (!analysisPart || analysisPart.type !== "data-analysis" || !analysisPart.data) {
    return null;
  }

  try {
    const parsed = typeof analysisPart.data === "string" ? JSON.parse(analysisPart.data) : analysisPart.data;
    const validation = AnalysisSchema.safeParse(parsed);
    return validation.success ? validation.data : null;
  } catch {
    return null;
  }
}

function extractSectionalDataFromParts(parts: MetabotUIMessagePart[]): SectionalAnalysisData {
  const sectionalData: SectionalAnalysisData = {};

  for (const part of parts) {
    if (part.type === "data-summary") {
      sectionalData.summary = typeof part.data === "string"
        ? { text: part.data, citations: [] }
        : { text: part.data.text, citations: part.data.citations ?? [] };
    } else if (part.type === "data-claims") {
      sectionalData.claims = part.data;
    } else if (part.type === "data-salary-benefit") {
      sectionalData.salaryBenefit = part.data;
    } else if (part.type === "data-risks") {
      sectionalData.risks = part.data;
    } else if (part.type === "data-explanation") {
      sectionalData.explanations = part.data;
    } else if (part.type === "data-references") {
      sectionalData.references = part.data;
    } else if (part.type === "data-actions") {
      sectionalData.actions = part.data.actions;
    } else if (part.type === "data-action-insight") {
      sectionalData.actionInsight = part.data;
    } else if (part.type === "data-suggested-questions") {
      sectionalData.suggestedQuestions = part.data;
    } else if (part.type === "data-reasoning") {
      sectionalData.reasoning = part.data;
    }
  }

  return sectionalData;
}

function hasInterleavableDataPart(part: MetabotUIMessagePart): boolean {
  return (
    part.type === "data-summary" ||
    part.type === "data-claims" ||
    part.type === "data-known-scam" ||
    part.type === "data-link-request" ||
    part.type === "data-salary-benefit" ||
    part.type === "data-risks" ||
    part.type === "data-checks" ||
    part.type === "data-explanation" ||
    part.type === "data-references" ||
    part.type === "data-actions" ||
    part.type === "data-action-insight" ||
    part.type === "data-suggested-questions" ||
    part.type === "data-reasoning" ||
    part.type === "data-telaah-share" ||
    part.type === "data-similar-telaah" ||
    part.type === "data-session-move" ||
    part.type === "data-quota" ||
    part.type === "data-alur-check"
  );
}

export function AssistantMessage({
  message,
  chatId,
  isStreaming,
  isLastMessage,
  completedStepSelections,
  onInteractiveChoice,
  onSuggestionClick,
  onActionClick,
  pendingActionId = null,
  usedActionIds,
  isActionLoading = false,
  onTelaahChoice,
  feedbackConversationId = null,
  sourceText,
  sourceFiles,
  userName,
}: AssistantMessageProps) {
  const fadeUp = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.24, ease: "easeOut" as const },
  };

  const isCurrentlyStreaming = isStreaming && isLastMessage;
  const { targetMessageId } = useInteractionStore();
  const isHighlighted = targetMessageId === message.id;

  const mountedRef = React.useRef(true);
  const shouldAnimate = mountedRef.current;

  React.useEffect(() => {
    mountedRef.current = false;
  }, []);

  const parts = React.useMemo(() => ((message.parts || []) as MetabotUIMessagePart[]), [message.parts]);

  const hasInteractiveSteps = React.useMemo(
    () => parts.some((part) => part.type === "interactive-step"),
    [parts]
  );

  const analysisData = React.useMemo(() => extractAnalysisFromParts(parts), [parts]);
  const sectionalData = React.useMemo(() => extractSectionalDataFromParts(parts), [parts]);

  const hasInterleavedFlow = React.useMemo(
    () => parts.some((part) => hasInterleavableDataPart(part) && part.type !== "data-analysis"),
    [parts]
  );

  const availableReasoning = React.useMemo(() => {
    if (hasInterleavedFlow) {
      return sectionalData.reasoning;
    }

    return analysisData?.reasoning;
  }, [analysisData?.reasoning, hasInterleavedFlow, sectionalData.reasoning]);

  const hasConversationTextStarted = React.useMemo(
    () => parts.some((part) => part.type === "text" && part.text.trim().length > 0),
    [parts]
  );

  const shouldOpenReasoning =
    isCurrentlyStreaming &&
    !!(availableReasoning && availableReasoning.length > 0) &&
    !hasConversationTextStarted;

  const lastTextPartIndex = React.useMemo(() => {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (parts[i].type === "text") {
        return i;
      }
    }

    return -1;
  }, [parts]);

  const renderItems = React.useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];

    if (hasInterleavedFlow) {
      parts.forEach((part, index) => {
        const key = `${message.id}-part-${index}-${part.type}`;

        if (part.type === "text" || part.type === "interactive-step" || part.type === "choice-summary") {
          items.push({ kind: "preview-part", key, part, partIndex: index });
          return;
        }

        if (part.type === "data-reasoning" && part.data.length > 0) {
          items.push({ kind: "reasoning", key, reasoning: part.data });
          return;
        }

        if (part.type === "data-summary") {
          const summary = typeof part.data === "string" ? part.data : part.data.text;
          const citations: Citation[] = typeof part.data === "string" ? [] : part.data.citations ?? [];

          if (summary.trim().length > 0) {
            items.push({ kind: "summary", key, summary, citations });
          }
          return;
        }

        if (part.type === "data-claims" && part.data.length > 0) {
          items.push({ kind: "claims", key, claims: part.data });
          return;
        }

        if (part.type === "data-known-scam" && part.data.length > 0) {
          items.push({ kind: "known-scam", key, cases: part.data });
          return;
        }

        if (part.type === "data-link-request") {
          items.push({ kind: "link-request", key });
          return;
        }

        if (part.type === "data-salary-benefit") {
          items.push({ kind: "salary-benefit", key, assessment: part.data });
          return;
        }

        if (part.type === "data-risks" && part.data.length > 0) {
          items.push({ kind: "risks", key, risks: part.data });
          return;
        }

        if (part.type === "data-checks" && part.data.length > 0) {
          items.push({ kind: "checks", key, checks: part.data });
          return;
        }

        if (part.type === "data-explanation" && part.data.length > 0) {
          items.push({ kind: "explanations", key, explanations: part.data });
          return;
        }

        if (part.type === "data-references" && part.data.length > 0) {
          items.push({ kind: "references", key, references: part.data });
          return;
        }

        if (part.type === "data-actions" && part.data.actions.length > 0) {
          items.push({ kind: "actions", key, actions: part.data.actions });
          return;
        }

        if (part.type === "data-action-insight" && part.data.points.length > 0) {
          items.push({ kind: "action-insight", key, actionInsight: part.data });
          return;
        }

        if (part.type === "data-suggested-questions" && part.data.length > 0) {
          items.push({ kind: "suggested-questions", key, questions: part.data });
          return;
        }

        if (part.type === "data-telaah-share") {
          items.push({ kind: "telaah-share", key, share: part.data });
          return;
        }

        if (part.type === "data-similar-telaah") {
          items.push({ kind: "similar-telaah", key, data: part.data });
          return;
        }

        if (part.type === "data-session-move") {
          items.push({ kind: "session-move", key, previousTitle: part.data.previousTitle });
        }

        if (part.type === "data-quota") {
          items.push({ kind: "quota", key, reason: part.data.reason });
        }

        if (part.type === "data-alur-check") {
          items.push({ kind: "alur-check", key, data: part.data });
        }
      });

      return items;
    }

    if (availableReasoning && availableReasoning.length > 0) {
      items.push({ kind: "reasoning", key: `${message.id}-analysis-reasoning`, reasoning: availableReasoning });
    }

    const hasPreviewableParts = parts.some(
      (part) => part.type === "text" || part.type === "interactive-step" || part.type === "choice-summary"
    );

    if (hasPreviewableParts) {
      items.push({ kind: "preview-full", key: `${message.id}-preview-full` });
    }

    if (!analysisData) {
      return items;
    }

    if (analysisData.summary.trim().length > 0) {
      items.push({
        kind: "summary",
        key: `${message.id}-analysis-summary`,
        summary: analysisData.summary,
        citations: analysisData.summaryCitations ?? [],
      });
    }

    if (analysisData.claims.length > 0) {
      items.push({ kind: "claims", key: `${message.id}-analysis-claims`, claims: analysisData.claims });
    }

    if (analysisData.knownCases?.length) {
      items.push({ kind: "known-scam", key: `${message.id}-analysis-known-scam`, cases: analysisData.knownCases });
    }

    if (analysisData.salaryBenefit) {
      items.push({
        kind: "salary-benefit",
        key: `${message.id}-analysis-salary-benefit`,
        assessment: analysisData.salaryBenefit,
      });
    }

    if (analysisData.risks.length > 0) {
      items.push({ kind: "risks", key: `${message.id}-analysis-risks`, risks: analysisData.risks });
    }

    if (analysisData.checks?.length) {
      items.push({ kind: "checks", key: `${message.id}-analysis-checks`, checks: analysisData.checks });
    }

    if (analysisData.explanations.length > 0) {
      items.push({
        kind: "explanations",
        key: `${message.id}-analysis-explanations`,
        explanations: analysisData.explanations,
      });
    }

    if (analysisData.references.length > 0) {
      items.push({ kind: "references", key: `${message.id}-analysis-references`, references: analysisData.references });
    }

    if (analysisData.suggestedQuestions.length > 0) {
      items.push({
        kind: "suggested-questions",
        key: `${message.id}-analysis-suggested-questions`,
        questions: analysisData.suggestedQuestions,
      });
    }

    return items;
  }, [analysisData, availableReasoning, hasInterleavedFlow, message.id, parts]);

  const renderItem = (item: RenderItem) => {
    if (item.kind === "preview-full") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <PreviewMessage
            chatId={chatId}
            message={message}
            isLoading={isCurrentlyStreaming}
            completedStepSelections={completedStepSelections}
            onInteractiveChoice={onInteractiveChoice}
          />
        </motion.div>
      );
    }

    if (item.kind === "preview-part") {
      const singlePartMessage: MetabotUIMessage = {
        ...message,
        parts: [item.part],
      };

      return (
        <motion.div key={item.key} {...fadeUp}>
          <PreviewMessage
            chatId={chatId}
            message={singlePartMessage}
            isLoading={isCurrentlyStreaming && item.partIndex === lastTextPartIndex}
            completedStepSelections={completedStepSelections}
            onInteractiveChoice={onInteractiveChoice}
          />
        </motion.div>
      );
    }

    if (item.kind === "reasoning") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <ReasoningComponent
            messageId={message.id}
            reasoning={item.reasoning}
            isStreaming={isCurrentlyStreaming}
            defaultOpen={shouldOpenReasoning}
          />
        </motion.div>
      );
    }

    if (item.kind === "summary") {
      return (
        <motion.div key={item.key} {...fadeUp} className="mt-2">
          <SummaryCard summary={item.summary} citations={item.citations} />
        </motion.div>
      );
    }

    if (item.kind === "claims") {
      return (
        <motion.section key={item.key} {...fadeUp} className="space-y-2">
          {item.claims.map((claim, index) => (
            <ClaimCard
              key={`${item.key}-claim-${index}`}
              text={claim.text}
              riskLevel={claim.riskLevel}
            />
          ))}
        </motion.section>
      );
    }

    if (item.kind === "risks") {
      return (
        <motion.section key={item.key} {...fadeUp} className="space-y-2">
          {item.risks.map((risk, index) => (
            <RiskCard
              key={`${item.key}-risk-${index}`}
              type={risk.type}
              description={risk.description}
              evidence={risk.evidence}
            />
          ))}
        </motion.section>
      );
    }

    if (item.kind === "checks") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <ChecksCard checks={item.checks} />
        </motion.div>
      );
    }

    if (item.kind === "known-scam") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <KnownScamCard cases={item.cases} />
        </motion.div>
      );
    }

    if (item.kind === "link-request") {
      // Answered by regenerating this message, so only the latest one still asks
      if (!isLastMessage || isStreaming || !onTelaahChoice) return null;
      return (
        <motion.div key={item.key} {...fadeUp}>
          <LinkRequestCard
            onSubmit={(url) => onTelaahChoice({ kind: "link-given", messageId: message.id, url })}
            onSkip={() => onTelaahChoice({ kind: "skip-link", messageId: message.id })}
          />
        </motion.div>
      );
    }

    if (item.kind === "salary-benefit") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <SalaryBenefitCard assessment={item.assessment} />
        </motion.div>
      );
    }

    if (item.kind === "explanations") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <section className="space-y-2">
            {item.explanations.map((entry, index) => (
              <ExplanationCard
                key={`${item.key}-explanation-${index}`}
                title={entry.title}
                explanation={entry.explanation}
              />
            ))}
          </section>
        </motion.div>
      );
    }

    if (item.kind === "references") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <details className="group rounded-xl bg-background border border-input p-4 py-3 transition-colors hover:bg-muted/70">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Sumber</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <section className="mt-3 space-y-2">
              {item.references.map((reference, index) => (
                <ReferenceCard key={`${item.key}-reference-${index}`} reference={reference} />
              ))}
            </section>
          </details>
        </motion.div>
      );
    }

    if (item.kind === "suggested-questions") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <SuggestionQuestions
            messageId={message.id}
            questions={item.questions}
            onQuestionClick={onSuggestionClick}
          />
        </motion.div>
      );
    }

    if (item.kind === "actions") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <AnalysisActions
            messageId={message.id}
            actions={usedActionIds ? item.actions.filter((action) => !usedActionIds.has(action.id)) : item.actions}
            onActionClick={onActionClick}
            isLoading={isActionLoading}
            pendingActionId={pendingActionId}
          />
        </motion.div>
      );
    }

    if (item.kind === "action-insight") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <ActionInsightCard title={item.actionInsight.title} points={item.actionInsight.points} />
        </motion.div>
      );
    }

    if (item.kind === "telaah-share") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <BuatPostPrompt share={item.share} onCreate={() => onTelaahChoice?.({ kind: "share", messageId: message.id, share: item.share })} />
        </motion.div>
      );
    }

    // Choices only make sense on the latest answer: they replace it or move its question elsewhere.
    const canChoose = isLastMessage && !isCurrentlyStreaming;

    if (item.kind === "similar-telaah") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <SimilarTelaahCard
            data={item.data}
            disabled={!canChoose}
            onSelfAnalyze={() => onTelaahChoice?.({ kind: "self-analyze", messageId: message.id })}
          />
        </motion.div>
      );
    }

    if (item.kind === "quota") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <QuotaNotice
            reason={item.reason}
            disabled={!canChoose}
            onContinue={() => onTelaahChoice?.({ kind: "continue-session", messageId: message.id })}
          />
        </motion.div>
      );
    }

    if (item.kind === "alur-check") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <AlurChatCard messageId={message.id} readFacts={item.data.readFacts} />
        </motion.div>
      );
    }

    if (item.kind === "session-move") {
      return (
        <motion.div key={item.key} {...fadeUp}>
          <SessionMoveCard
            previousTitle={item.previousTitle}
            disabled={!canChoose}
            onMove={() => onTelaahChoice?.({ kind: "move-session", messageId: message.id })}
            onStay={() => onTelaahChoice?.({ kind: "same-posting", messageId: message.id })}
          />
        </motion.div>
      );
    }

    return null;
  };

  return (
    <div
      className={`flex gap-2 items-end group ${shouldAnimate ? "animate-in slide-in-from-left-2 duration-300" : ""} ${
        isHighlighted ? "message-highlight-container" : ""
      }`}
    >
      <div className="w-full md:max-w-full relative">
        <div
          className={`min-w-20 rounded-xl rounded-bl-sm pl-0 py-0 text-sm leading-relaxed text-foreground ${
            isHighlighted ? "message-highlight" : ""
          }`}
        >
          <div className="space-y-3">{renderItems.map((item) => renderItem(item))}</div>
        </div>

        {!isCurrentlyStreaming && !hasInteractiveSteps && (
          <MessageActions parts={parts} sourceText={sourceText} sourceFiles={sourceFiles} userName={userName} />
        )}

        {!isCurrentlyStreaming && feedbackConversationId && (
          <MessageFeedback
            conversationId={feedbackConversationId}
            messageId={message.id}
            initialRating={(message.metadata as { feedback?: "baik" | "buruk" } | undefined)?.feedback ?? null}
          />
        )}

      </div>
    </div>
  );
}
