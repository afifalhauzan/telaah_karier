"use client";

import { ChatFooter, type ComposerAttachment } from "@/components/chat/chat-footer";
import { prepareAttachments } from "@/lib/attachments";
import { ChatStart } from "@/components/chat/chat-start";
import { ConfirmModal } from "@/components/ui/modal";
import { UserMessage } from "@/components/chat/UserMessage";
import { AssistantMessage, type TelaahChoice } from "@/components/chat/AssistantMessage";
import { LoginPromptHost, useLoginPrompt } from "@/components/telaah-bersama/login-prompt";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { startShareDraft } from "@/lib/telaah-bersama/share-handoff";
import { useRouter } from "next/navigation";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useChatInitialization } from "@/hooks/useChatInitialization";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useScrollToMessage } from "@/hooks/useScrollToMessage";
import { useConversationStore } from "@/lib/conversation-store";
import {
  clearLandingChatDraft,
  readLandingChatDraft,
  saveLandingChatDraft,
  type LandingChatDraft,
} from "@/lib/landing-chat-handoff";
import { type MetabotUIMessage, type MetabotUIMessagePart } from "@/types/streaming";
import { ChevronDown, List } from "lucide-react";
import { openSession } from "@/components/sidebar/session-history";
import { ContextPanel, collectSessionContext, countSessionContext } from "@/components/sidebar/context-panel";
import toast from 'react-hot-toast';
import React from "react";
import Link from "next/link";
import { notifyBlocked, sessionShare, sessionsLeft, useQuotaStore } from "@/lib/quota-store";
import { buildCompactSeed } from "@/lib/compact-session";
import { persistLatestExchange } from "@/lib/chat-persistence";
import { useStreaming } from "@/contexts/StreamingContext";
import { HistoryPanel, SidePanel } from "@/components/sidebar/sidebar";
import { SessionDonut } from "@/components/sidebar/usage-meter";
import { type SidebarSourceItem } from "@/components/sidebar/SourceItem";
import { AnalysisSchema } from "@/langchain/agents/analyzer/schema";
import type { FileUIPart } from "ai";
import { DEFAULT_ANALYSIS_ACTIONS, type AnalysisAction, type UIActionId, type UIActionPayload } from "@/types/ui-actions";

function mapReferencesToSidebarSources(
  references: Array<{ title?: string; url?: string; citations?: Array<{ id?: string }> }>
): SidebarSourceItem[] {
  return references
    .filter(
      (reference) =>
        typeof reference.title === "string" &&
        reference.title.trim().length > 0 &&
        typeof reference.url === "string" &&
        reference.url.trim().length > 0
    )
    .map((reference, index) => ({
      id: reference.citations?.[0]?.id ?? `reference-${index + 1}`,
      title: reference.title as string,
      link: reference.url as string,
    }));
}

function extractActionContextFromMessage(message?: MetabotUIMessage): { claim?: string; context?: string } {
  if (!message) {
    return {};
  }

  const parts = (message.parts || []) as MetabotUIMessagePart[];

  const claimPart = parts.find((part) => part.type === "data-claims");
  const summaryPart = parts.find((part) => part.type === "data-summary");
  const explanationPart = parts.find((part) => part.type === "data-explanation");

  const claim =
    claimPart && claimPart.type === "data-claims" && claimPart.data.length > 0
      ? claimPart.data[0].text
      : undefined;

  const summaryContext =
    summaryPart && summaryPart.type === "data-summary"
      ? typeof summaryPart.data === "string"
        ? summaryPart.data
        : summaryPart.data.text
      : undefined;

  const explanationContext =
    explanationPart?.type === "data-explanation"
      ? explanationPart.data.map((entry) => `${entry.title}: ${entry.explanation}`).join("\n\n")
      : undefined;

  const context = summaryContext ?? explanationContext;

  if (claim || context) {
    return { claim, context };
  }

  const analysisPart = parts.find((part) => part.type === "data-analysis");
  if (!analysisPart || analysisPart.type !== "data-analysis" || !analysisPart.data) {
    return {};
  }

  try {
    const parsed = typeof analysisPart.data === "string" ? JSON.parse(analysisPart.data) : analysisPart.data;
    const validation = AnalysisSchema.safeParse(parsed);
    if (!validation.success) {
      return {};
    }

    return {
      claim: validation.data.claims[0]?.text,
      context:
        validation.data.summary ||
        validation.data.explanations.map((entry) => `${entry.title}: ${entry.explanation}`).join("\n\n"),
    };
  } catch {
    return {};
  }
}

function extractLatestAttachmentMetadata(messages: MetabotUIMessage[]): UIActionPayload["attachment"] | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== "user") {
      continue;
    }

    const filePart = ((messages[i].parts || []) as MetabotUIMessagePart[]).find((part) => part.type === "file");
    if (filePart && filePart.type === "file") {
      return {
        name: filePart.filename,
        type: filePart.mediaType,
        size: (filePart as any).size ?? filePart.providerMetadata?.size,
        previewUrl: filePart.url,
      };
    }
  }

  return undefined;
}

/** The user message an assistant answer replied to. */
function questionBefore(messages: MetabotUIMessage[], answerId: string): MetabotUIMessage | undefined {
  const index = messages.findIndex((message) => message.id === answerId);
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

function filesOf(message: MetabotUIMessage | undefined) {
  return ((message?.parts || []) as MetabotUIMessagePart[]).flatMap((part) =>
    part.type === "file" && part.url.startsWith("data:") ? [{ filename: part.filename, mediaType: part.mediaType, url: part.url }] : []
  );
}

// What the phone share sheet sends (app/manifest.ts, share_target)
const SHARE_PARAMS = ["share_title", "share_text", "share_url"];

/** The shared title, text, and link as one draft, without repeats (apps often put the link in the text too). */
function takeSharedDraft(): string {
  const url = new URL(window.location.href);
  const parts = SHARE_PARAMS.map((name) => url.searchParams.get(name)?.trim() ?? "").filter(Boolean);
  if (!parts.length) return "";
  SHARE_PARAMS.forEach((name) => url.searchParams.delete(name));
  window.history.replaceState(window.history.state, "", url);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.filter((part) => !unique.some((other) => other !== part && other.includes(part))).join("\n");
}

function textOf(message: MetabotUIMessage | undefined): string {
  return ((message?.parts || []) as MetabotUIMessagePart[])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

export function Chat() {
  // Get streaming state from context
  const {
    messages,
    sendMessage,
    status,
    stop,
    isLoading,
    isAuthReady,
    isHistoryLoading,
    handleRefresh,
    renderMessageContent,
    chatId,
    handleInteractiveChoice,
    regenerateWith,
  } = useStreaming();
  const router = useRouter();
  const { user } = useCurrentUser();
  const openLoginPrompt = useLoginPrompt((state) => state.open);
  const { quota, refresh: refreshQuota } = useQuotaStore();

  // === Initialization Engine ===
  const {
    conversationId,
    isInitializing,
    error,
    handleCreateNewSession
  } = useChatInitialization();

  const { setHasMessages } = useConversationStore();

  // Create refs at top level to use in multiple hooks
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  // === Focus Scroll Engine (Highlight Navigation) ===
  const {
    justScrolledToContextRef,
    shouldLockScroll: messageLocked
  } = useScrollToMessage({
    messagesContainerRef
  });

  // === Auto-Scroll Engine ===
  const {
    messagesEndRef,
    isAtBottom,
    scrollToBottom
  } = useAutoScroll({ messages, disabled: messageLocked, messagesContainerRef });

  // UI State
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const [pendingLandingDraft, setPendingLandingDraft] = React.useState<LandingChatDraft | null>(null);
  const [showResetModal, setShowResetModal] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isContextOpen, setIsContextOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [pendingActionId, setPendingActionId] = React.useState<UIActionId | null>(null);
  const hasHydratedLandingDraftRef = React.useRef(false);
  const hasAutoSentLandingDraftRef = React.useRef(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const initialIsMobile = mediaQuery.matches;
    setIsMobile(initialIsMobile);

    if (initialIsMobile) {
      setIsSidebarOpen(false);
    }

    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
      return () => mediaQuery.removeEventListener("change", handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  React.useEffect(() => {
    if (hasHydratedLandingDraftRef.current) return;

    const draft = readLandingChatDraft();
    hasHydratedLandingDraftRef.current = true;

    const shared = takeSharedDraft();
    if (shared) {
      setInput(shared);
      return;
    }
    if (!draft) return;

    setPendingLandingDraft(draft);
    setInput(draft.text);
    setAttachments(
      draft.attachments.map((attachment) => ({
        type: "file",
        id: attachment.id,
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        url: attachment.url,
        size: attachment.size,
      }))
    );
  }, []);

  React.useEffect(() => {
    if (!pendingLandingDraft || hasAutoSentLandingDraftRef.current) return;
    if (!conversationId || isInitializing || !isAuthReady || isLoading) return;

    const hasText = pendingLandingDraft.text.trim().length > 0;
    const fileParts: FileUIPart[] = pendingLandingDraft.attachments.map(({ id, size, ...filePart }) => ({
      type: "file",
      ...filePart,
    }));

    if (!hasText && fileParts.length === 0) {
      clearLandingChatDraft();
      setPendingLandingDraft(null);
      return;
    }

    hasAutoSentLandingDraftRef.current = true;

    if (hasText) {
      sendMessage({
        text: pendingLandingDraft.text.trim(),
        files: fileParts.length > 0 ? fileParts : undefined,
      });
    } else {
      sendMessage({ files: fileParts });
    }

    clearLandingChatDraft();
    setPendingLandingDraft(null);
    setInput("");
    setAttachments([]);

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom();
      }, 120);
    });
  }, [
    conversationId,
    isAuthReady,
    isInitializing,
    isLoading,
    pendingLandingDraft,
    scrollToBottom,
    sendMessage,
  ]);

  const sidebarSources = React.useMemo<SidebarSourceItem[]>(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const parts = (messages[i].parts || []) as MetabotUIMessagePart[];
      const referencesPart = parts.find((part) => part.type === 'data-references');

      if (
        referencesPart &&
        referencesPart.type === "data-references" &&
        Array.isArray(referencesPart.data) &&
        referencesPart.data.length > 0
      ) {
        const mappedFromReferences = mapReferencesToSidebarSources(referencesPart.data);
        if (mappedFromReferences.length > 0) {
          return mappedFromReferences;
        }
      }

      const analysisPart = parts.find((part) => part.type === 'data-analysis');

      if (!analysisPart || analysisPart.type !== 'data-analysis' || !analysisPart.data) {
        continue;
      }

      try {
        const parsed = typeof analysisPart.data === 'string'
          ? JSON.parse(analysisPart.data)
          : analysisPart.data;

        const validation = AnalysisSchema.safeParse(parsed);
        if (validation.success && validation.data.references?.length > 0) {
          const mappedFromReferences = mapReferencesToSidebarSources(validation.data.references);
          if (mappedFromReferences.length > 0) {
            return mappedFromReferences;
          }
        }

        // Backward compatibility for historical stored analysis data that still used `sources`.
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).sources)) {
          const legacySources = (parsed as any).sources
            .filter((item: any) => typeof item?.title === "string" && typeof item?.link === "string")
            .map((source: any, sourceIndex: number) => ({
              id: typeof source.id === "string" ? source.id : `legacy-source-${sourceIndex + 1}`,
              title: source.title,
              link: source.link,
            }));

          if (legacySources.length > 0) {
            return legacySources;
          }
        }
      } catch {
        continue;
      }
    }

    return [];
  }, [messages]);

  const sessionContext = React.useMemo(() => collectSessionContext(messages), [messages]);
  const contextCount = countSessionContext(sessionContext, sidebarSources);

  // Fetched once per session; the chat stream keeps it current after every answer
  React.useEffect(() => {
    if (conversationId) void refreshQuota(conversationId);
  }, [conversationId, user?.id, refreshQuota]);

  // One line above the composer: why a new session cannot start, or how full this one is
  const quotaNotice = (() => {
    const isNewSession = messages.length === 0;
    const left = sessionsLeft(quota);
    const share = sessionShare(quota);

    if (isNewSession && left === 0) {
      return `Kuota sesi hari ini habis (${quota?.sessionsUsed}/${quota?.sessionsLimit}). Direset pukul 00.00 WIB.`;
    }
    if (isNewSession && quota?.guest && quota.guestSessionId && quota.guestSessionId !== conversationId) {
      return (
        <>
          Kamu sudah memakai satu sesi tanpa akun.{" "}
          <Link href="/login?from=/chat" className="font-medium text-primary underline-offset-2 hover:underline">
            Masuk untuk lanjut
          </Link>
        </>
      );
    }
    if (share >= 1) {
      return (
        <>
          Sesi ini sudah penuh.{" "}
          <button type="button" onClick={() => void continueInNewSession()} className="font-medium text-primary underline-offset-2 hover:underline">
            Lanjutkan di sesi baru
          </button>
        </>
      );
    }
    if (share > 0) return <SessionDonut share={share} />;
    return null;
  })();

  // An action is sent as a message with its label, so the ones asked in this session drop out of the chips
  const usedActionIds = React.useMemo(() => {
    const asked = new Set(messages.filter((message) => message.role === "user").map((message) => textOf(message)));
    return new Set(DEFAULT_ANALYSIS_ACTIONS.filter((action) => asked.has(action.label)).map((action) => action.id));
  }, [messages]);

  const completedStepSelections = React.useMemo(() => {
    const completed = new Map<string, string>();

    for (const message of messages) {
      for (const part of (message.parts || []) as MetabotUIMessagePart[]) {
        if (part.type === 'choice-summary' && part.data?.stepId && part.data?.selection) {
          completed.set(part.data.stepId, part.data.selection);
        }
      }
    }

    return completed;
  }, [messages]);

  // Update hasMessages state when messages change
  React.useEffect(() => {
    setHasMessages(messages.length > 0);
  }, [messages.length, setHasMessages]);

  React.useEffect(() => {
    if (!isLoading) {
      setPendingActionId(null);
    }
  }, [isLoading]);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    const hasText = input.trim().length > 0;
    const hasFiles = attachments.length > 0;

    if ((hasText || hasFiles) && conversationId && !isInitializing) {
      const fileParts: FileUIPart[] = attachments.map(({ id, size, ...filePart }) => filePart);

      if (hasText) {
        sendMessage({ text: input, files: fileParts.length > 0 ? fileParts : undefined });
      } else {
        sendMessage({ files: fileParts });
      }

      setInput("");
      setAttachments([]);

      // Trigger scroll to bottom after 1s (same behavior as FAB)
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom();
        }, 120);
      });
    } else {
      toast.error('Pesan kosong/lampiran belum ada atau ID percakapan tidak valid. Silahkan refresh halaman jika mengalami masalah ini.');
      console.log('[CHAT] Message blocked:', { hasInput: hasText, hasFiles, hasConversationId: !!conversationId, isInitializing });
    }
  };

  // Read inside the callback so pastes in quick succession still count earlier attachments.
  const attachmentCountRef = React.useRef(0);
  attachmentCountRef.current = attachments.length;

  const handleSelectFiles = React.useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    try {
      const { attachments: prepared, rejections } = await prepareAttachments(files, attachmentCountRef.current);
      rejections.forEach((message) => toast.error(message));
      if (prepared.length > 0) {
        setAttachments((prev) => [...prev, ...prepared.map((item) => ({ type: "file" as const, ...item }))]);
      }
    } catch (error) {
      console.error("[Chat] Failed to prepare attachments:", error);
      toast.error("Gagal membaca lampiran. Coba lagi ya.");
    }
  }, []);

  // Bridges the page-level drag-and-drop dropzone (app/chat/page.tsx) into the
  // existing attachment pipeline without prop-drilling the file input state up.
  React.useEffect(() => {
    const handlePageDroppedFiles = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      if (files?.length) {
        handleSelectFiles(files);
      }
    };

    window.addEventListener("telaahkarier:dropped-files", handlePageDroppedFiles);
    return () => window.removeEventListener("telaahkarier:dropped-files", handlePageDroppedFiles);
  }, [handleSelectFiles]);

  const handleRemoveAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    if (conversationId && !isInitializing) {
      sendMessage({ text: suggestion });

      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom();
        }, 120);
      });
    }
  };

  // Starter suggestions are drafts: the user adds the posting before sending.
  const handleStarterClick = (suggestion: string) => {
    setInput(suggestion);
    requestAnimationFrame(() => {
      const element = composerRef.current;
      element?.focus();
      element?.setSelectionRange(suggestion.length, suggestion.length);
    });
  };

  const handleActionClick = (action: AnalysisAction, sourceMessageId?: string) => {
    if (!conversationId || isInitializing || isLoading) {
      return;
    }

    const sourceMessage = sourceMessageId ? messages.find((message) => message.id === sourceMessageId) : undefined;
    const { claim, context } = extractActionContextFromMessage(sourceMessage);
    const attachment = extractLatestAttachmentMetadata(messages);

    const payload: UIActionPayload = {
      type: "UI_ACTION",
      actionId: action.id,
      actionLabel: action.label,
      sourceMessageId,
      claim,
      context,
      attachment,
    };

    setPendingActionId(action.id);
    sendMessage(
      { text: action.label },
      {
        action_type: "UI_ACTION",
        action_payload: payload,
      }
    );

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom();
      }, 120);
    });
  };

  /**
   * A full session goes on in a new one that starts from its latest analysis (the "compact"). The
   * new session is saved before it opens, so its history loads with the analysis in place.
   */
  const continueInNewSession = async () => {
    if (!user) {
      openLoginPrompt("Masuk untuk melanjutkan di sesi baru.");
      return;
    }
    if (sessionsLeft(quota) === 0) {
      notifyBlocked("daily_limit");
      return;
    }

    const seed = buildCompactSeed(messages);
    if (!seed) {
      openSession();
      return;
    }
    try {
      const { id } = await fetch("/api/conversation/init", { method: "POST" }).then((response) => response.json());
      await persistLatestExchange(id, seed);
      openSession(id);
    } catch {
      toast.error("Sesi baru gagal dibuat. Coba lagi sebentar lagi.");
    }
  };

  const handleTelaahChoice = (choice: TelaahChoice) => {
    if (choice.kind === "share") {
      if (!user) {
        openLoginPrompt("Masuk untuk membagikan hasil telaah ke TelaahBareng.");
        return;
      }
      startShareDraft(choice.share, filesOf(questionBefore(messages, choice.messageId)));
      router.push("/telaah-bersama/buat");
      return;
    }

    if (isLoading) return;

    if (choice.kind === "link-given") {
      regenerateWith(choice.messageId, { given_links: [choice.url] });
    } else if (choice.kind === "skip-link") {
      regenerateWith(choice.messageId, { skip_link_request: true });
    } else if (choice.kind === "self-analyze") {
      regenerateWith(choice.messageId, { skip_similar: true });
    } else if (choice.kind === "same-posting") {
      regenerateWith(choice.messageId, { same_posting: true });
    } else if (choice.kind === "continue-session") {
      void continueInNewSession();
    } else {
      // The new session sends the moved message on its own, like a message started on the landing page.
      const question = questionBefore(messages, choice.messageId);
      const attachments = filesOf(question).map((file, index) => ({ id: `moved-${index}`, ...file }));
      try {
        saveLandingChatDraft({ text: textOf(question), attachments });
      } catch {
        // Large images can exceed browser storage: move the text and ask for the files again.
        saveLandingChatDraft({ text: textOf(question), attachments: [] });
        if (attachments.length) toast("Lampiran terlalu besar untuk dipindahkan. Lampirkan lagi di sesi baru.");
      }
      openSession();
    }
  };

  const handleResetClick = () => {
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    await handleCreateNewSession();
    handleRefresh();
    setShowResetModal(false);
  };

  const toggleHistory = () => {
    setIsSidebarOpen((open) => !open);
    // Phones show one overlay at a time.
    if (isMobile) setIsContextOpen(false);
  };

  const toggleContext = () => {
    setIsContextOpen((open) => !open);
    if (isMobile) setIsSidebarOpen(false);
  };

  // The user message an answer responds to: its text and attachments go into the answer's export
  const findSourceMaterial = (answerIndex: number) => {
    for (let i = answerIndex - 1; i >= 0; i -= 1) {
      if (messages[i].role !== "user") continue;

      const parts = (messages[i].parts || []) as MetabotUIMessagePart[];
      return {
        sourceText: parts
          .map((part) => (part.type === "text" ? part.text : ""))
          .filter(Boolean)
          .join("\n")
          .trim(),
        sourceFiles: parts.flatMap((part) =>
          part.type === "file" && part.url ? [{ mediaType: part.mediaType, filename: part.filename, url: part.url }] : []
        ),
      };
    }

    return {};
  };

  const renderMessage = (message: MetabotUIMessage, index: number) => {
    const isUser = message.role === "user";
    const isLastMessage = index === messages.length - 1;

    if (isUser) {
      return (
        <UserMessage
          key={message.id}
          message={message}
          renderMessageContent={renderMessageContent}
        />
      );
    }

    return (
      <AssistantMessage
        key={message.id}
        message={message}
        chatId={chatId}
        isStreaming={status === "streaming"}
        isLastMessage={isLastMessage}
        completedStepSelections={completedStepSelections}
        onInteractiveChoice={handleInteractiveChoice}
        onSuggestionClick={handleSuggestionClick}
        onActionClick={handleActionClick}
        pendingActionId={pendingActionId}
        usedActionIds={usedActionIds}
        isActionLoading={isLoading}
        onTelaahChoice={handleTelaahChoice}
        feedbackConversationId={user ? conversationId : null}
        userName={user?.name}
        {...findSourceMaterial(index)}
      />
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <SidePanel
          side="left"
          isOpen={isSidebarOpen}
          isMobile={isMobile}
          label="sidebar"
          hasRail
          onToggle={toggleHistory}
        >
          <HistoryPanel
            activeConversationId={conversationId}
            collapsed={!isSidebarOpen && !isMobile}
            onExpand={() => setIsSidebarOpen(true)}
          />
        </SidePanel>

        <div className="flex min-h-0 w-full min-w-0 flex-1 items-stretch justify-center">
          {/* On phones the panel tabs get a row of their own (SidePanel), so nothing scrolls under them */}
          <section className="relative z-10 flex min-w-0 flex-1 shrink-0 flex-col bg-background pt-11 md:max-w-3xl md:pt-0 lg:w-full">

            <LoginPromptHost />

            {/* Chat Box */}
            <div
              ref={messagesContainerRef}
              className="no-scrollbar flex-1 bg-background overflow-y-auto p-4 pt-1 md:pt-4 flex flex-col gap-3.5 "
            >
              {!isAuthReady ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Memuat autentikasi...</p>
                  </div>
                </div>
              ) : isInitializing ? (
                <div className="flex gap-2 items-end animate-in fade-in duration-500">
                  <div className="max-w-full md:max-w-[80%] rounded-xl rounded-bl-sm border border-border bg-secondary p-3 text-sm leading-relaxed text-secondary-foreground">
                    <div className="flex gap-1 items-center">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-duration:1.4s]"></span>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.2s] [animation-duration:1.4s]"></span>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.4s] [animation-duration:1.4s]"></span>
                      </div>
                      <span className="ml-2 animate-pulse">Memulai percakapan...</span>
                    </div>
                  </div>
                </div>
              ) : messages.length === 0 && isHistoryLoading ? (
                <div className="flex flex-1 items-center justify-center" aria-busy="true">
                  <p className="animate-pulse text-sm text-muted-foreground">Memuat riwayat telaah…</p>
                </div>
              ) : messages.length === 0 ? (
                <ChatStart
                  onSuggestionClick={handleStarterClick}
                  onAlurClick={handleSuggestionClick}
                  isLoading={isLoading || isInitializing || !isAuthReady}
                />
              ) : (
                <>
                  {messages.map((message: MetabotUIMessage, index: number) => {
                    const isLastUserMessage = message.role === 'user' && index === messages.length - 1;

                    return (
                      <div key={message.id} data-message-id={message.id}>
                        {renderMessage(message, index)}

                        {/* Show typing indicator below user message when loading */}
                        {isLoading && isLastUserMessage && (
                          <TypingIndicator />
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              <div
                ref={messagesEndRef}
                className="shrink-0 min-w-[24px] min-h-[10px]"
              />
            </div>

            <div className="relative shrink-0">
            <ChatFooter
              notice={quotaNotice}
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading || isInitializing}
              attachments={attachments}
              onSelectFiles={handleSelectFiles}
              onRemoveAttachment={handleRemoveAttachment}
              onStop={isLoading ? stop : undefined}
            inputRef={composerRef}
            />

            {/* Scroll to Bottom FAB: just above the footer, whatever height the composer has */}
            {!isAtBottom && (
              <div className="absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 pointer-events-auto">
                <button
                  onClick={scrollToBottom}
                  className="flex items-center justify-center h-8 px-[6px] bg-white border border-border text-gray-800 rounded-full shadow-lg hover:bg-primary/90 hover:text-primary-foreground transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in fade-in zoom-in-75 duration-200"
                  title="Scroll to latest message"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            )}
            </div>

            {/* <ConfirmModal
            isOpen={showResetModal}
            onClose={() => setShowResetModal(false)}
            onConfirm={handleConfirmReset}
            title="Reset Percakapan"
            description="Apakah anda yakin untuk menghapus sesi percakapan ini? Ini akan menghapus semua pesan dan riwayat percakapan."
            confirmText="Reset"
            cancelText="Cancel"
            isDestructive={true}
          /> */}
          </section>
        </div>

        <SidePanel
          side="right"
          isOpen={isContextOpen}
          isMobile={isMobile}
          label="konteks sesi"
          closedIcon={<List className="h-5 w-5 " />}
          badge={contextCount}
          onToggle={toggleContext}
        >
          <h2 className="mb-4 text-sm font-semibold text-foreground">Pada sesi ini</h2>
          <ContextPanel context={sessionContext} sources={sidebarSources} />
        </SidePanel>
      </div>
    </div>
  );
}
