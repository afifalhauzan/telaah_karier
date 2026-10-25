"use client";

import type React from "react";
import { Composer, type ComposerProps } from "@/components/chat/composer";

export interface ComposerAttachment {
  type: "file";
  id: string;
  filename?: string;
  mediaType: string;
  url: string;
  size?: number;
}

export function ChatFooter({ notice, ...props }: ComposerProps & { notice?: React.ReactNode }) {
  return (
    <footer className="sticky bottom-0 left-0 right-0 w-full bg-background px-4 pb-3 pt-2 md:relative md:shrink-0">
      {/* The quota line (components/chat.tsx) */}
      {notice && <p className="mb-1.5 px-1 text-right text-xs text-muted-foreground">{notice}</p>}
      <Composer {...props} />
      <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground/70">
        Ini analisis risiko awal, bukan vonis final. Selalu verifikasi ke kanal resmi sebelum mendaftarkan diri.
      </p>
    </footer>
  );
}
