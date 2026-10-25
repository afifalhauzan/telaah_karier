"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findLinks } from "@/langchain/agents/telaah-bersama/identifiers";

interface LinkRequestCardProps {
  onSubmit: (url: string) => void;
  onSkip: () => void;
}

/** The question before the analysis: the link from the bio, comments, or DM, or skip it. */
export function LinkRequestCard({ onSubmit, onSkip }: LinkRequestCardProps) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [url] = findLinks(value);
    if (url) onSubmit(url);
    else setInvalid(true);
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-input bg-background p-3 shadow-sm">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          placeholder="Tempel link pendaftaran"
          aria-label="Link pendaftaran"
          aria-invalid={invalid}
          inputMode="url"
        />
        <Button type="submit" size="sm" className="shrink-0">
          Telusuri
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-red-600" role="alert">
          {invalid ? "Tempel alamat link-nya, misalnya https://bit.ly/…" : null}
        </p>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={onSkip}>
          Lewati
        </Button>
      </div>
    </form>
  );
}
