import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { PROGRESS_INTENT, runAnalysis } from "@/langchain/agents/analyzer/analyze";
import { handleUIAction } from "@/langchain/agents/analyzer/action-handler";
import { answerFollowUp } from "@/langchain/agents/analyzer/follow-up";
import { classifyNewMaterial, decideTurnMode } from "@/langchain/agents/analyzer/turn-router";
import {
  findPostingContext,
  recentTurns,
  toMessageList,
  type LooseMessage,
  type PostingContext,
} from "@/langchain/agents/analyzer/conversation-context";
import {
  composeMaterialText,
  extractAttachments,
  isSupportedAttachment,
  limitAttachments,
  type ExtractionRun,
} from "@/langchain/agents/analyzer/extraction";
import { preprocessJobInput } from "@/langchain/agents/analyzer/preprocessor";
import { linkRequest, type LinkRequest } from "@/langchain/agents/analyzer/checks";
import { decodeQrLinks } from "@/langchain/agents/analyzer/tools/qr";
import { findLinks } from "@/langchain/agents/telaah-bersama/identifiers";
import { buildSharePayload, signSharePayload } from "@/langchain/agents/telaah-bersama/share-payload";
import {
  findSimilarTelaah,
  ownSignalLabels,
  recordMatchShown,
  type SimilarMatch,
} from "@/langchain/agents/telaah-bersama/similar";
import type { SimilarTelaahPartData } from "@/types/streaming";
import { DEFAULT_ANALYSIS_ACTIONS, UIActionPayloadSchema, type UIActionPayload } from "@/types/ui-actions";
import { generateSessionTitle } from "@/langchain/agents/session-title";
import { getAccessToken } from "@/lib/server-auth";
import { loadStoredAttachments } from "@/lib/stored-attachments";
import { chargeSession, GUEST_COOKIE, guestCookieOptions, openSession, type QuotaBlock } from "@/lib/quota";
import type { TokenUsage } from "@/langchain/agents/analyzer/llm";
import { detectAlurIntent } from "@/lib/telaah-alur/trigger";

const STREAM_CHUNK_DELAY_MS = 28;
const SECTION_STEP_DELAY_MS = 220;
const MAX_FOLLOW_UP_TURNS = 6;
const UNSUPPORTED_FILE_MESSAGE =
  "Format file ini belum bisa diperiksa. Kirim lowongan dalam bentuk gambar (poster atau screenshot), PDF, atau tempel teksnya.";

function extractLatestUserText(body: any): string {
  const lastMessage = body?.messages?.[body.messages.length - 1];
  if (!lastMessage) {
    return "";
  }

  if (Array.isArray(lastMessage.parts)) {
    return lastMessage.parts
      .filter((part: any) => part?.type === "text")
      .map((part: any) => String(part?.text ?? ""))
      .join("\n")
      .trim();
  }

  if (typeof lastMessage.content === "string") {
    return lastMessage.content.trim();
  }

  return "";
}

interface ExtractedFilePart {
  mediaType: string;
  url: string;
}

function extractLatestFileParts(body: any): { attachments: ExtractedFilePart[]; unsupportedCount: number } {
  const lastMessage = body?.messages?.[body.messages.length - 1];
  if (!lastMessage || !Array.isArray(lastMessage.parts)) {
    return { attachments: [], unsupportedCount: 0 };
  }

  const files: ExtractedFilePart[] = lastMessage.parts
    .filter((part: any) => part?.type === "file" && typeof part?.mediaType === "string")
    .map((part: any) => ({ mediaType: part.mediaType as string, url: String(part?.url ?? "") }))
    .filter((part: ExtractedFilePart) => part.url.length > 0);

  const attachments = files.filter((file) => isSupportedAttachment(file.mediaType));
  return { attachments, unsupportedCount: files.length - attachments.length };
}

function extractUIActionPayload(body: any): UIActionPayload | null {
  const rawPayload =
    body?.action_payload ??
    body?.ui_action_payload ??
    body?.uiActionPayload ??
    null;

  const isActionRequest = body?.action_type === "UI_ACTION" || rawPayload?.type === "UI_ACTION";

  if (!isActionRequest || !rawPayload) {
    return null;
  }

  const parsed = UIActionPayloadSchema.safeParse(rawPayload);
  return parsed.success ? parsed.data : null;
}

function buildStreamText(analysis: { conversationText?: string }): string {
  const conversationText = analysis.conversationText?.trim() ?? "";
  return conversationText.length > 0
    ? conversationText
    : "Saya siap membantu telaah risiko lowongan. Tempel poster, teks, atau link yang ingin dicek.";
}

// Each chunk carries the whitespace before its word, so line breaks (Markdown lists) survive.
function chunkByWords(text: string): string[] {
  const chunks = text.trim().match(/\s*\S+/g);
  return chunks?.length ? chunks : [""];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamTextBlock({
  writer,
  text,
  id,
}: {
  writer: any;
  text: string;
  id: string;
}) {
  if (!text.trim().length) {
    return;
  }

  writer.write({ type: "text-start", id });
  for (const delta of chunkByWords(text)) {
    writer.write({ type: "text-delta", id, delta });
    await sleep(STREAM_CHUNK_DELAY_MS);
  }
  writer.write({ type: "text-end", id });
}

const SIMILAR_FOUND_MESSAGE =
  "Lowongan seperti ini **sudah pernah ditelaah dan dibagikan** di TelaahBareng. Kamu bisa membaca Telaah itu beserta diskusinya, atau tetap menelaah pesanmu sendiri.";
// Shown instead of an answer; the card under it (data-quota) offers the way on
const QUOTA_MESSAGES: Record<QuotaBlock, string> = {
  guest_limit: "Kamu sudah memakai satu sesi TelaahLoker tanpa akun. **Masuk atau daftar** untuk lanjut dengan kuota harian akun.",
  guest_ip_limit: "Batas sesi tanpa akun dari jaringan ini sudah tercapai hari ini. **Masuk atau daftar** untuk lanjut.",
  daily_limit: "Kuota sesi TelaahLoker kamu hari ini sudah habis. Kuota direset pukul **00.00 WIB**.",
  session_full:
    "Sesi ini sudah mencapai batasnya. Lanjutkan di sesi baru: hasil telaah terakhir dibawa sebagai ringkasan, jadi kamu tidak perlu mengirim ulang lowongannya.",
};
const SESSION_MOVE_MESSAGE =
  "Sepertinya ini lowongan lain dari yang sedang dibahas. Supaya konteksnya tidak tercampur, pindahkan ke sesi baru? Pesanmu belum dianalisis.";

const LINK_PLACE_TEXT: Record<LinkRequest["place"], string> = {
  bio: "di bio",
  komentar: "di kolom komentar",
  dm: "lewat DM",
};
const GIVEN_LINKS_HEADER = "[Link pendaftaran yang disalin pengguna]";
const MAX_GIVEN_LINKS = 3;

function linkRequestText({ place, handle }: LinkRequest): string {
  const account = handle ? ` akun @${handle}` : "";
  return `Link pendaftaran lowongan ini ada ${LINK_PLACE_TEXT[place]}${account}. Tempel link-nya di bawah supaya saya telusuri dulu sampai ke tujuannya, baru saya telaah.`;
}

/** The links pasted into the link request card; anything that is no link is dropped. */
function parseGivenLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const links = value.filter((item): item is string => typeof item === "string" && item.length <= 2000).flatMap((item) => findLinks(item).slice(0, 1));
  return [...new Set(links)].slice(0, MAX_GIVEN_LINKS);
}

const SESSION_NAME_LENGTH = 60;

/** Short name of the posting a session is about, for the "move to a new session" card. */
function describeSessionPosting(context: PostingContext, messages: LooseMessage[]): string {
  // The session's title, as the history list shows it; guests' sessions are not titled
  const titlePart = messages.flatMap((message) => message.parts ?? []).find((part) => part.type === "data-session-title");
  const title = (titlePart?.data as { title?: unknown } | undefined)?.title;
  if (typeof title === "string" && title.trim()) return title.trim();

  const company = context.analysis.material?.entities?.companyNames?.[0];
  if (company) return company;
  // The summary's opening, cut at a word so it never ends mid-word
  const firstSentence = (context.analysis.summary ?? context.postingText).split(/(?<=[.!?])\s/)[0] ?? "";
  if (firstSentence.length <= SESSION_NAME_LENGTH) return firstSentence || "lowongan sebelumnya";
  return `${firstSentence.slice(0, SESSION_NAME_LENGTH).replace(/\s+\S*$/, "")}…`;
}

/** Counts a match once per viewer per day without storing who the viewer is. */
function viewerKey(req: NextRequest): string {
  const token = getAccessToken(req);
  if (token) return `u:${createHash("sha256").update(token).digest("hex").slice(0, 24)}`;
  return `ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`;
}

function toSimilarPart(match: SimilarMatch, ownSignals: string[]): SimilarTelaahPartData {
  const { post } = match;
  const topComment = post.comments?.find((comment) => !comment.flag && !comment.isDeleted);
  return {
    post: {
      id: post.id,
      title: post.title,
      riskLevel: post.riskLevel,
      claim: post.claim,
      summary: post.summary,
      evidence: post.evidence.map((item) => ({ ...item, evidence: item.evidence ?? undefined })),
      analyzedAt: post.analyzedAt,
      reactionCount: post.reactionCount,
      commentCount: post.commentCount,
      topComment: topComment?.author && topComment.body ? { author: topComment.author, body: topComment.body } : null,
    },
    reasons: match.reasons,
    differentPeriod: match.differentPeriod,
    ownSignals,
  };
}

/** Offers the TelaahAlur check under an answer when the user says they are in a recruitment process. */
function offerAlurCheck(writer: any, text: string) {
  const intent = detectAlurIntent(text);
  if (intent) writer.write({ type: "data-alur-check", data: { readFacts: intent.readFacts } });
}

/** Names the session for the history list. Sent last so it never delays the answer itself. */
async function writeSessionTitle(writer: any, question: string, answer: string) {
  const title = await generateSessionTitle({ question, answer });
  if (title) {
    writer.write({ type: "data-session-title", data: { title } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // A reloaded session sends its attachments as links to the stored files
    await loadStoredAttachments(body?.messages, getAccessToken(req));
    const actionPayload = extractUIActionPayload(body);
    const input = extractLatestUserText(body);
    const { attachments, unsupportedCount } = extractLatestFileParts(body);
    // Only signed-in sessions are saved, so only they need a title, and only once.
    const shouldTitleSession = toMessageList(body?.messages).length === 1 && !!getAccessToken(req);

    // Checked before any model call; what the calls use is charged to the session afterwards
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : undefined;
    const quota = await openSession(req, conversationId);
    const usages: Array<TokenUsage | undefined> = [];

    const answer = async (writer: any) => {
        if (actionPayload) {
          const openingTextId = `action-opening-${Date.now()}`;
          const closingTextId = `action-closing-${Date.now()}`;
          const result = await handleUIAction(actionPayload, body?.messages);
          usages.push(result.tokenUsage);

          await streamTextBlock({
            writer,
            text: result.openingText,
            id: openingTextId,
          });
          await sleep(SECTION_STEP_DELAY_MS);

          writer.write({
            type: "data-action-insight",
            data: {
              actionId: actionPayload.actionId,
              title: result.title,
              points: result.points,
            },
          });
          await sleep(SECTION_STEP_DELAY_MS);

          if (result.salaryBenefit) {
            writer.write({ type: "data-salary-benefit", data: result.salaryBenefit });
            await sleep(SECTION_STEP_DELAY_MS);
          }

          if (result.references?.length) {
            writer.write({ type: "data-references", data: result.references });
            await sleep(SECTION_STEP_DELAY_MS);
          }

          await streamTextBlock({
            writer,
            text: result.closingText,
            id: closingTextId,
          });
          await sleep(SECTION_STEP_DELAY_MS);

          writer.write({
            type: "data-actions",
            data: { actions: DEFAULT_ANALYSIS_ACTIONS },
          });

          return;
        }

        // Questions about the posting under discussion (or general ones) are answered with that
        // context instead of being analyzed as if they were a new posting.
        const messages = toMessageList(body?.messages);
        const latestIndex = messages.length - 1;
        const context = findPostingContext(messages, latestIndex - 1);
        if (unsupportedCount && !attachments.length && !input.length) {
          await streamTextBlock({ writer, text: UNSUPPORTED_FILE_MESSAGE, id: `unsupported-file-${Date.now()}` });
          return;
        }

        const decision = await decideTurnMode({ text: input, imageCount: attachments.length, context });

        if (decision.mode === "follow_up") {
          const turns = recentTurns(messages, context ? context.analysisIndex + 1 : 0, latestIndex, MAX_FOLLOW_UP_TURNS);
          const { result, meta } = await answerFollowUp({ question: input, context, turns });
          usages.push(meta.tokenUsage);
          console.info("[chat] follow-up run", JSON.stringify({ route: decision.reason, ...meta }));

          await streamTextBlock({ writer, text: result.answer, id: `follow-up-${Date.now()}` });

          if (result.references.length) {
            await sleep(SECTION_STEP_DELAY_MS);
            writer.write({ type: "data-references", data: result.references });
          }
          if (result.suggestedQuestions.length) {
            await sleep(SECTION_STEP_DELAY_MS);
            writer.write({ type: "data-suggested-questions", data: result.suggestedQuestions });
          }
          offerAlurCheck(writer, input);
          if (shouldTitleSession) {
            await writeSessionTitle(writer, input, result.answer);
          }
          return;
        }

        const openingTextId = `analysis-opening-${Date.now()}`;
        const followupTextId = `analysis-followup-${Date.now()}`;
        const closingTextId = `analysis-closing-${Date.now()}`;
        const reasoningPartId = `analysis-reasoning-${Date.now()}`;

        // TelaahBareng steps before the pipeline (design doc 6.1), both outside the engine. One
        // session holds one posting: later material is checked against it, and only the first
        // material of a session is compared with existing posts.
        const isSubstantive = attachments.length > 0 || preprocessJobInput(input).hasSubstantiveContent;
        const checkNewPosting = !!context && body?.same_posting !== true && isSubstantive;
        const checkSimilar = !context && body?.skip_similar !== true && isSubstantive;
        let extraction: ExtractionRun | undefined;
        let materialText = input;

        if (checkNewPosting || checkSimilar) {
          if (checkSimilar) {
            writer.write({
              type: "data-reasoning",
              id: reasoningPartId,
              data: [{ intent: PROGRESS_INTENT, steps: ["Memeriksa apakah lowongan ini sudah pernah ditelaah di TelaahBareng"] }],
            });
          }
          // Read once here and handed to runAnalysis, so attachments are not read twice.
          if (attachments.length) {
            extraction = await extractAttachments(limitAttachments(attachments).usable);
            materialText = composeMaterialText(input, extraction.material?.transcript);
            // Charged here: the turn may end before the analysis (moved session, earlier post)
            usages.push(extraction.tokenUsage);
          }
        }

        if (checkNewPosting && context) {
          const continuation = await classifyNewMaterial({ materialText, context });
          console.info("[chat] posting check", JSON.stringify(continuation));
          if (continuation.isNewPosting) {
            await streamTextBlock({ writer, text: SESSION_MOVE_MESSAGE, id: `session-move-${Date.now()}` });
            writer.write({ type: "data-session-move", data: { previousTitle: describeSessionPosting(context, messages) } });
            return;
          }
        }

        if (checkSimilar) {
          const { match, meta: similarMeta } = await findSimilarTelaah(materialText);
          console.info("[chat] similar check", JSON.stringify(similarMeta));
          if (match) {
            recordMatchShown(match.post.id, viewerKey(req));
            await streamTextBlock({ writer, text: SIMILAR_FOUND_MESSAGE, id: `similar-${Date.now()}` });
            writer.write({ type: "data-similar-telaah", data: toSimilarPart(match, ownSignalLabels(materialText)) });
            offerAlurCheck(writer, input);
            if (shouldTitleSession) {
              await writeSessionTitle(writer, input || materialText, `${match.post.title}\n${match.post.summary}`);
            }
            return;
          }
        }

        // A link only the applicant can open (bio, comments, DM) is asked for before the analysis,
        // which then runs once with it; "Lewati" or a link given ends the question
        const givenLinks = parseGivenLinks(body?.given_links);
        if (!givenLinks.length && body?.skip_link_request !== true) {
          if (attachments.length && !extraction) {
            extraction = await extractAttachments(limitAttachments(attachments).usable);
            materialText = composeMaterialText(input, extraction.material?.transcript);
            usages.push(extraction.tokenUsage);
          }
          const request = linkRequest(materialText, await decodeQrLinks(attachments));
          if (request) {
            await streamTextBlock({ writer, text: linkRequestText(request), id: `link-request-${Date.now()}` });
            writer.write({ type: "data-link-request", data: request });
            return;
          }
        }
        const analysisInput = givenLinks.length ? `${input}\n\n${GIVEN_LINKS_HEADER}\n${givenLinks.join("\n")}` : input;

        // Each pipeline stage reports as it actually finishes, so the "thinking" panel shows real
        // progress (rules, web search, model) instead of a replay after the fact.
        const { result: analysis, meta } = await runAnalysis(
          { input: analysisInput, images: attachments },
          {
            onProgress: (reasoning) => writer.write({ type: "data-reasoning", id: reasoningPartId, data: reasoning }),
            extraction,
            // Reaching here with a context means this is a later stage of the session's posting
            earlierMaterial: context?.material,
          }
        );
        // The reading done above was already charged; runAnalysis reports it again in its meta
        usages.push(meta.tokenUsage, extraction ? undefined : meta.extraction.tokenUsage);
        // Metadata only: never log the posting or the analysis text.
        console.info("[chat] analysis run", JSON.stringify({ route: decision.reason, ...meta }));

        const openingText = buildStreamText(analysis);
        await streamTextBlock({
          writer,
          text: openingText,
          id: openingTextId,
        });
        await sleep(SECTION_STEP_DELAY_MS);

        if (analysis.reasoning?.length) {
          writer.write({ type: "data-reasoning", id: reasoningPartId, data: analysis.reasoning });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.summary?.trim().length) {
          writer.write({
            type: "data-summary",
            data: {
              text: analysis.summary,
              citations: analysis.summaryCitations ?? [],
            },
          });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.claims?.length) {
          // Claim text is rendered by ClaimCard below; avoid streaming it twice as a plain text bubble.
          writer.write({ type: "data-claims", data: analysis.claims });
          await sleep(SECTION_STEP_DELAY_MS);
          if (analysis.knownCases?.length) {
            writer.write({ type: "data-known-scam", data: analysis.knownCases });
            await sleep(SECTION_STEP_DELAY_MS);
          }
        } else {
          await streamTextBlock({
            writer,
            text: "Ceritakan detail lowongannya (teks, link, atau poster) supaya saya bisa bantu telaah.",
            id: followupTextId,
          });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.salaryBenefit) {
          writer.write({ type: "data-salary-benefit", data: analysis.salaryBenefit });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.risks?.length) {
          writer.write({ type: "data-risks", data: analysis.risks });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.checks?.length) {
          writer.write({ type: "data-checks", data: analysis.checks });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.explanations?.length) {
          writer.write({ type: "data-explanation", data: analysis.explanations });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.similarCases?.length) {
          writer.write({ type: "data-similar-cases", data: analysis.similarCases });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        if (analysis.references?.length) {
          writer.write({ type: "data-references", data: analysis.references });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        const hasRiskVerdict = analysis.claims.length > 0;

        if (hasRiskVerdict) {
          writer.write({
            type: "data-actions",
            data: { actions: DEFAULT_ANALYSIS_ACTIONS },
          });
          await sleep(SECTION_STEP_DELAY_MS);

          // Only Sedang/Tinggi verdicts get one; it is what the "Buat post?" button publishes from.
          const share = buildSharePayload({ analysis, userText: input, attachments });
          if (share) {
            writer.write({ type: "data-telaah-share", data: signSharePayload(share) });
          }
        }

        const closingText = hasRiskVerdict
          ? "Kalau kamu mau, kita bisa lanjutkan dengan investigasi spesifik lewat tombol aksi di bawah."
          : "Kalau ada bagian yang ingin didalami, beri tahu saya.";
        await streamTextBlock({
          writer,
          text: closingText,
          id: closingTextId,
        });
        await sleep(SECTION_STEP_DELAY_MS);

        if (analysis.suggestedQuestions?.length) {
          writer.write({ type: "data-suggested-questions", data: analysis.suggestedQuestions });
          await sleep(SECTION_STEP_DELAY_MS);
        }

        // Keep compatibility for existing consumers and historical parsing paths.
        writer.write({ type: "data-analysis", data: analysis });
        offerAlurCheck(writer, input);

        if (shouldTitleSession) {
          await writeSessionTitle(
            writer,
            input || analysis.material?.transcript || "",
            [analysis.claims[0]?.text, analysis.summary, analysis.conversationText].filter(Boolean).join("\n")
          );
        }
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        if (quota.blocked) {
          await streamTextBlock({ writer, text: QUOTA_MESSAGES[quota.blocked], id: `quota-${Date.now()}` });
          writer.write({ type: "data-quota", data: { reason: quota.blocked, state: quota.state } });
          return;
        }

        await answer(writer);
        const state = await chargeSession(req, conversationId, quota.state, usages);
        // Transient: it updates the quota display and is not kept in the message
        if (state) writer.write({ type: "data-quota-state", data: state, transient: true });
      },

      onError: (error) => (error instanceof Error ? error.message : "Unknown stream error"),
    });

    const response = createUIMessageStreamResponse({ stream });
    if (!quota.guestCookie) return response;

    // A guest's one session: later sessions in this browser are refused (lib/quota.ts)
    const withCookie = new NextResponse(response.body, { status: response.status, headers: response.headers });
    withCookie.cookies.set(GUEST_COOKIE, quota.guestCookie, guestCookieOptions());
    return withCookie;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
