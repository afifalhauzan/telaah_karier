"use client";

import React from "react";
import { ArrowLeft, ArrowRight, Check, Pencil, Quote, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/utils";
import {
  OTHER,
  UNKNOWN,
  answerLabel,
  choicesOf,
  isAnswered,
  otherKey,
  type AlurAnswers,
  type Question,
  type ReadFacts,
} from "@/lib/telaah-alur/questions";

// Answers that stand alone: picking one of them clears the rest, and picking anything else clears them
const EXCLUSIVE = new Set(["tidak_ada", UNKNOWN]);
const MIN_SEARCH = 3;
// Long enough to see the chip light up before the next question slides in
const ADVANCE_DELAY_MS = 250;

export type FlowPhase = "konfirmasi" | "tanya" | "ringkasan";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  );
}

function CountrySearch({
  question,
  answers,
  onPick,
}: {
  question: Question;
  answers: AlurAnswers;
  onPick: (value: string, own?: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const term = query.trim().toLowerCase();
  const matches =
    term.length >= MIN_SEARCH
      ? (question.options ?? []).filter(
          (option) => option.value !== OTHER && `${option.label} ${option.keywords ?? ""}`.toLowerCase().includes(term)
        )
      : [];
  const current = answerLabel(question, answers);

  return (
    <div className="space-y-2">
      {current && (
        <p className="flex items-center gap-1.5 text-sm text-foreground">
          <Check className="h-4 w-4 text-primary" />
          Terpilih: <span className="font-medium">{current}</span>
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ketik nama negara atau kota, mis. Malaysia, Dubai"
          aria-label={question.label}
          className="h-11 pl-9"
          maxLength={60}
          autoFocus
        />
      </div>
      {term.length > 0 && term.length < MIN_SEARCH && (
        <p className="text-xs text-muted-foreground">Ketik minimal {MIN_SEARCH} huruf.</p>
      )}
      {term.length >= MIN_SEARCH && (
        <ul className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Hasil pencarian negara">
          {matches.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => onPick(option.value)}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                {option.label}
              </button>
            </li>
          ))}
          <li className={cn(matches.length > 0 && "border-t border-border")}>
            <button
              type="button"
              onClick={() => onPick(OTHER, query.trim())}
              className="w-full px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            >
              {matches.length ? "Tidak ada di daftar? " : "Tidak ditemukan. "}
              Pakai &ldquo;<span className="text-foreground">{query.trim()}</span>&rdquo;
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

const applies = (question: Question, answers: AlurAnswers) => !question.showIf || question.showIf(answers);

/**
 * The questions one at a time, like a conversation rather than a form: a tap on a single answer moves on.
 * Answers read from a story are confirmed together first and not asked again; a summary closes the flow
 * and lets any answer be changed. `questions` includes the read ones, so they can be confirmed.
 */
export function QuestionFlow({
  questions: allQuestions,
  answers,
  onChange,
  readFacts = {},
  initialPhase,
  summary = true,
  focusOnMount = true,
  extra,
  onBack,
  onFinish,
}: {
  questions: Question[];
  answers: AlurAnswers;
  onChange: (answers: AlurAnswers) => void;
  readFacts?: ReadFacts;
  initialPhase?: FlowPhase;
  // Without a summary the flow finishes right after the last question (the core questions)
  summary?: boolean;
  // Off where the flow appears below other content (the follow-ups), so focus does not jump to it
  focusOnMount?: boolean;
  // Shown on the summary, before the result (the closing note)
  extra?: React.ReactNode;
  // Without it, the first question has no "Kembali"
  onBack?: () => void;
  // Gets the answers as they are after the last change, which the parent may not have rendered yet
  onFinish: (answers: AlurAnswers) => void;
}) {
  const hasRead = Object.keys(readFacts).length > 0;
  const toAsk = (latest: AlurAnswers) => allQuestions.filter((question) => applies(question, latest) && !(question.id in readFacts));

  const [phase, setPhase] = React.useState<FlowPhase>(initialPhase ?? (hasRead ? "konfirmasi" : "tanya"));
  const [currentId, setCurrentId] = React.useState<string | undefined>(() => toAsk(answers)[0]?.id);
  // Set when an answer is changed from the confirmation or the summary: done goes back there
  const [returnTo, setReturnTo] = React.useState<FlowPhase | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Move focus to the new question so screen readers announce it, unless its input already took focus
  const mountedRef = React.useRef(focusOnMount);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const heading = headingRef.current;
    // The page keeps its own scroll; the heading is near the top anyway
    if (heading && !heading.closest("section")?.contains(document.activeElement)) heading.focus({ preventScroll: true });
  }, [phase, currentId]);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const questions = allQuestions.filter((question) => applies(question, answers));
  const queue = toAsk(answers);
  const question = questions.find((item) => item.id === currentId);
  const position = queue.findIndex((item) => item.id === currentId);

  const advance = (latest: AlurAnswers) => {
    clearTimeout(timerRef.current);
    if (returnTo) {
      setPhase(returnTo);
      setReturnTo(null);
      return;
    }
    const list = toAsk(latest);
    const next = list[list.findIndex((item) => item.id === currentId) + 1];
    if (next) setCurrentId(next.id);
    else if (summary) setPhase("ringkasan");
    else onFinish(latest);
  };

  const back = () => {
    clearTimeout(timerRef.current);
    if (returnTo) {
      setPhase(returnTo);
      setReturnTo(null);
    } else if (position > 0) {
      setCurrentId(queue[position - 1].id);
    } else if (hasRead) {
      setPhase("konfirmasi");
    } else {
      onBack?.();
    }
  };

  const startAsking = () => {
    if (queue.length === 0) return summary ? setPhase("ringkasan") : onFinish(answers);
    setCurrentId(queue[0].id);
    setPhase("tanya");
  };

  const edit = (id: string, from: FlowPhase) => {
    setCurrentId(id);
    setReturnTo(from);
    setPhase("tanya");
  };

  if (phase === "konfirmasi") {
    const read = questions.filter((item) => item.id in readFacts);
    return (
      <section className="space-y-4" aria-labelledby="alur-flow-heading">
        <div>
          <h2 id="alur-flow-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
            Ini yang kami tangkap dari pesanmu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Periksa sekilas. Kalau ada yang keliru, ketuk untuk mengubahnya.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {read.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => edit(item.id, "konfirmasi")}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{item.label}</span>
                  <span className="mt-0.5 block text-sm font-medium text-foreground">{answerLabel(item, answers) ?? "Belum dijawab"}</span>
                  <span className="mt-1 flex items-start gap-1.5 text-xs italic text-muted-foreground">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                    &ldquo;{readFacts[item.id].quote}&rdquo;
                  </span>
                </span>
                <Pencil className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Ubah" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => onBack?.()}>
            <ArrowLeft />
            Kembali
          </Button>
          <Button onClick={startAsking}>
            {queue.length ? `Benar, lanjut (${queue.length})` : "Benar, lanjut"}
            <ArrowRight />
          </Button>
        </div>
      </section>
    );
  }

  if (phase === "ringkasan" || !question) {
    return (
      <section className="space-y-5" aria-labelledby="alur-flow-heading">
        <div>
          <h2 id="alur-flow-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
            Ringkasan jawabanmu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Ketuk jawaban untuk mengubahnya.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {questions.map((item) => {
            const label = answerLabel(item, answers);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => edit(item.id, "ringkasan")}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">{item.label}</span>
                    <span className={cn("mt-0.5 block text-sm", label ? "font-medium text-foreground" : "italic text-muted-foreground")}>
                      {label ?? "Belum dijawab"}
                    </span>
                  </span>
                  <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Ubah" />
                </button>
              </li>
            );
          })}
        </ul>
        {extra}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => {
              if (queue.length) {
                setCurrentId(queue[queue.length - 1].id);
                setPhase("tanya");
              } else if (hasRead) {
                setPhase("konfirmasi");
              } else {
                onBack?.();
              }
            }}
          >
            <ArrowLeft />
            Kembali
          </Button>
          <Button onClick={() => onFinish(answers)}>
            Lihat hasil
            <ArrowRight />
          </Button>
        </div>
      </section>
    );
  }

  const value = answers[question.id];
  const ownKey = otherKey(question.id);
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const fact = readFacts[question.id];
  const isFromStory = !!fact && JSON.stringify(fact.value) === JSON.stringify(value);

  const set = (patch: AlurAnswers) => {
    const latest = { ...answers, ...patch };
    onChange(latest);
    return latest;
  };

  const choose = (option: string) => {
    if (question.kind === "multi") {
      if (selected.includes(option)) return set({ [question.id]: selected.filter((item) => item !== option) });
      if (EXCLUSIVE.has(option)) return set({ [question.id]: [option] });
      return set({ [question.id]: [...selected.filter((item) => !EXCLUSIVE.has(item)), option] });
    }
    const latest = set({ [question.id]: option });
    // "Lainnya" waits for the user's words
    if (option !== OTHER) timerRef.current = setTimeout(() => advance(latest), ADVANCE_DELAY_MS);
  };

  return (
    // Keyed so each question mounts fresh: its input can take focus and no chip keeps the last one's
    <section key={question.id} className="space-y-5" aria-labelledby="alur-flow-heading">
      <div className="space-y-2">
        {returnTo ? (
          <p className="text-xs font-medium text-primary">Ubah jawaban</p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {position + 1} dari {queue.length}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${((position + 1) / queue.length) * 100}%` }} />
            </span>
          </div>
        )}
        <h2 id="alur-flow-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-snug text-foreground outline-none">
          {question.label}
        </h2>
        {question.hint && <p className="text-sm text-muted-foreground">{question.hint}</p>}
      </div>

      {question.kind === "search" && (
        <CountrySearch
          question={question}
          answers={answers}
          onPick={(option, own) => {
            const latest = set({ [question.id]: option, [ownKey]: own });
            advance(latest);
          }}
        />
      )}

      {question.kind === "text" && (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => set({ [question.id]: event.target.value })}
          onKeyDown={(event) => event.key === "Enter" && advance(answers)}
          maxLength={120}
          className="h-11"
          aria-label={question.label}
          autoFocus
        />
      )}

      {(question.kind === "single" || question.kind === "multi") && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role={question.kind === "single" ? "radiogroup" : "group"} aria-label={question.label}>
            {choicesOf(question).map((option) => (
              <Chip key={option.value} selected={selected.includes(option.value)} onClick={() => choose(option.value)}>
                {option.label}
              </Chip>
            ))}
          </div>
          {selected.includes(OTHER) && (
            <Input
              value={typeof answers[ownKey] === "string" ? (answers[ownKey] as string) : ""}
              onChange={(event) => set({ [ownKey]: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && advance(answers)}
              placeholder="Tulis jawabanmu sendiri"
              aria-label={`Jawaban lain: ${question.label}`}
              maxLength={200}
              className="h-11"
              autoFocus
            />
          )}
        </div>
      )}

      {isFromStory && (
        <p className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
          Dari pesanmu: &ldquo;{fact.quote}&rdquo;
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {returnTo || position > 0 || hasRead || onBack ? (
          <Button variant="ghost" onClick={back}>
            <ArrowLeft />
            Kembali
          </Button>
        ) : (
          <span />
        )}
        {isAnswered(question, answers) ? (
          <Button onClick={() => advance(answers)}>
            {returnTo ? "Simpan" : "Lanjut"}
            <ArrowRight />
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => advance(answers)} className="text-muted-foreground">
            Lewati
          </Button>
        )}
      </div>
    </section>
  );
}
