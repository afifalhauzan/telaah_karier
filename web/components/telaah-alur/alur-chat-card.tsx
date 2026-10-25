"use client";

import React from "react";
import { ArrowRight, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionFlow, type FlowPhase } from "@/components/telaah-alur/question-flow";
import { AlurResultView } from "@/components/telaah-alur/alur-result";
import { coreQuestions, factsFor, flowOf, type AlurAnswers, type ReadFacts } from "@/lib/telaah-alur/questions";
import { evaluateAlur } from "@/lib/telaah-alur/rules";
import { answersOf } from "@/lib/telaah-alur/trigger";

type Stage = "intro" | "inti" | "fakta" | "hasil";

interface Saved {
  stage: Stage;
  answers: AlurAnswers;
}

const storageKey = (messageId: string) => `telaah-alur:${messageId}`;

// The check runs in the browser only, so its progress is kept there too: reopening the session shows
// the result again. Storage can be unavailable (private mode); the card then simply starts over.
function load(messageId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(storageKey(messageId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(messageId: string, saved: Saved | null) {
  try {
    if (saved) window.localStorage.setItem(storageKey(messageId), JSON.stringify(saved));
    else window.localStorage.removeItem(storageKey(messageId));
  } catch {
    // Not saving only means starting over after a reload
  }
}

/**
 * TelaahAlur inside a chat answer: offered when the user says they are already in a recruitment
 * process. Questions and rules only, no model call; core answers read from the message are confirmed
 * first instead of asked again.
 */
export function AlurChatCard({ messageId, readFacts }: { messageId: string; readFacts: ReadFacts }) {
  const [stage, setStage] = React.useState<Stage>("intro");
  const [answers, setAnswers] = React.useState<AlurAnswers>(() => answersOf(readFacts));
  const [factsStart, setFactsStart] = React.useState<FlowPhase | undefined>();

  React.useEffect(() => {
    const saved = load(messageId);
    if (saved) {
      setStage(saved.stage);
      setAnswers(saved.answers);
    }
  }, [messageId]);

  const go = (next: Stage, latest: AlurAnswers = answers) => {
    setStage(next);
    setAnswers(latest);
    save(messageId, { stage: next, answers: latest });
  };

  const flow = flowOf(answers);
  // Facts beyond the core ones read from the message (the destination country), confirmed in the fact step
  const factFacts = Object.fromEntries(Object.entries(readFacts).filter(([id]) => id !== "jalur" && id !== "tahap"));

  if (stage === "intro") {
    return (
      <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label="Cek alur rekrutmen">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Route className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Kamu sedang dalam proses rekrutmen? Cek alurnya</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Jawab beberapa pertanyaan pilihan, sekitar satu menit. Kami periksa apakah ada langkah yang menyimpang dari prosedur
              resmi, lalu tunjukkan pihak yang bisa dihubungi. Jawabanmu tidak dikirim ke mana pun.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => go("inti")}>
          Mulai cek alur
          <ArrowRight />
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="Cek alur rekrutmen">
      {stage === "inti" && (
        <QuestionFlow
          key="inti"
          questions={coreQuestions(answers)}
          answers={answers}
          onChange={setAnswers}
          readFacts={readFacts}
          summary={false}
          focusOnMount={false}
          onBack={() => go("intro")}
          // Someone who cannot leave gets the contacts at once, without more questions
          onFinish={(latest) => go(latest.tahap === "terjebak" ? "hasil" : "fakta", latest)}
        />
      )}

      {stage === "fakta" && flow && (
        <QuestionFlow
          key="fakta"
          questions={factsFor(flow, answers)}
          answers={answers}
          onChange={setAnswers}
          readFacts={factFacts}
          initialPhase={factsStart}
          focusOnMount={false}
          onBack={() => go("inti")}
          onFinish={(latest) => go("hasil", latest)}
        />
      )}

      {stage === "hasil" && (
        <AlurResultView
          result={evaluateAlur(answers)}
          onEdit={
            answers.tahap === "terjebak"
              ? undefined
              : () => {
                  setFactsStart("ringkasan");
                  go("fakta");
                }
          }
          onRestart={() => {
            setFactsStart(undefined);
            save(messageId, null);
            setAnswers(answersOf(readFacts));
            setStage("intro");
          }}
        />
      )}
    </section>
  );
}
