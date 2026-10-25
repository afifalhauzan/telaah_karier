import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { internalKeyHeader } from "@/lib/server-auth";
import { buildCaseCard } from "@/langchain/agents/knowledge/case-card";

// Called by Laravel's scam-reports:cards for each new fact-check: this server holds the model keys.
// Only the internal key gets in, so the endpoint cannot be used to spend model calls from outside.

const ArticleSchema = z.object({
  title: z.string().max(500),
  posting_text: z.string().min(1).max(20000),
  narrative: z.string().max(20000),
  explanation: z.string().max(20000).nullable(),
  conclusion: z.string().max(5000).nullable(),
  source_links: z.array(z.string().max(2000)).max(50),
});

function isInternal(req: NextRequest): boolean {
  const expected = Buffer.from(internalKeyHeader()["X-Internal-Key"]);
  const given = Buffer.from(req.headers.get("x-internal-key") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: NextRequest) {
  if (!isInternal(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = ArticleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid article" }, { status: 422 });

  const article = parsed.data;
  try {
    const result = await buildCaseCard({
      title: article.title,
      postingText: article.posting_text,
      narrative: article.narrative,
      explanation: article.explanation,
      conclusion: article.conclusion,
      sourceLinks: article.source_links,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[CaseCard] Failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "card failed" }, { status: 502 });
  }
}
