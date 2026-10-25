"use client";

import React from "react";
import { Route } from "lucide-react";

interface Suggestion {
  id: number;
  text: string;
}

interface ChatStartProps {
  onSuggestionClick: (text: string) => void;
  // Sent as is: a first-person message opens the TelaahAlur check (lib/telaah-alur/trigger.ts)
  onAlurClick: (text: string) => void;
  isLoading: boolean;
}

const SUGGESTIONS: Suggestion[] = [
  { id: 1, text: "Cek poster lowongan ini, apakah ada tanda penipuan?" },
  { id: 2, text: "Periksa apakah perusahaan dan link pendaftarannya valid." },
  { id: 3, text: "Apakah lowongan magang ini aman untuk daftar?" },
  { id: 4, text: "Apakah wajar kalau recruiter meminta biaya administrasi?" },
];

const ALUR_MESSAGE = "Saya sudah terlanjur mendaftar lowongan kerja. Apa yang harus saya cek sekarang?";

export function ChatStart({ onSuggestionClick, onAlurClick, isLoading }: ChatStartProps) {
  return (
    // Compact on phones so the greeting and the suggestions fit without scrolling
    <div className="flex flex-col items-center justify-center px-2 py-2 antialiased md:min-h-[60vh] md:px-6 md:py-12">
      <section className="relative mb-6 flex w-full max-w-xl flex-col items-start animate-in fade-in slide-in-from-bottom-4 duration-700 md:mb-12">
        <div className="relative">
          <div
            className="
            relative z-10
            rounded-2xl rounded-bl-none
            border border-border/40
            bg-card p-5 text-card-foreground
            shadow-[0_8px_30px_rgb(0,0,0,0.04)]
            backdrop-blur-sm
            md:p-6
          "
          >
            <p className="text-md leading-relaxed md:text-base">
              <span className="mb-1 block text-xl font-semibold text-primary">Halo!</span>
              <span className="text-muted-foreground">
                Tempel poster, link, atau teks lowongan yang terasa meragukan. Kita bedah indikator risikonya dulu
                sebelum kamu daftar, kirim data, atau membayar biaya apa pun.
              </span>
            </p>
          </div>

          <div className="absolute bottom-0 -left-1 h-4 w-4 -z-0 rotate-[-15deg] rounded-sm border-l border-b border-border/40 bg-card shadow-sm" />
        </div>
      </section>

      <div className="w-full max-w-2xl">
        <div className="flex flex-wrap justify-center gap-2.5">
          {SUGGESTIONS.map((suggestion, index) => (
            // The entry animation lives on a wrapper so it doesn't fight the button's hover transform.
            // Each card follows the greeting bubble, staggered a little after the previous one.
            <div
              key={suggestion.id}
              className="max-w-full animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-700 md:max-w-[45%]"
              style={{ animationDelay: `${150 + index * 100}ms` }}
            >
              <button
                onClick={() => onSuggestionClick(suggestion.text)}
                disabled={isLoading}
                className="
                  group relative
                  inline-flex max-w-full items-center text-left
                  rounded-2xl border border-border/60
                  bg-muted/30 px-5 py-3
                  text-sm font-medium text-secondary-foreground
                  transition-all duration-300
                  hover:-translate-y-1 hover:border-primary/30 hover:bg-background hover:shadow-md
                  active:scale-95
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              >
                <span className="line-clamp-2">{suggestion.text}</span>
              </button>
            </div>
          ))}
        </div>
        <div
          className="mt-4 flex justify-center animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-700"
          style={{ animationDelay: `${150 + SUGGESTIONS.length * 100}ms` }}
        >
          <button
            onClick={() => onAlurClick(ALUR_MESSAGE)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Route className="h-4 w-4" aria-hidden />
            Sudah terlanjur mendaftar? Cek langkahnya
          </button>
        </div>
      </div>
    </div>
  );
}
