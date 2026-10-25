import { ExternalLink, ShieldAlert } from "lucide-react";
import type { KnownCase } from "@/langchain/agents/analyzer/schema";

interface KnownScamCardProps {
  cases: KnownCase[];
}

// Not a verdict: the user opens the fact-checks and compares them with the posting themselves.
export function KnownScamCard({ cases }: KnownScamCardProps) {
  const shared = [...new Set(cases.flatMap((item) => item.shared))];

  return (
    <section className="rounded-xl border-2 border-red-300 bg-red-50/60 p-4 shadow-sm dark:border-red-800 dark:bg-red-950/30">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            Kontak di lowongan ini pernah dipakai dalam penipuan
          </p>
          <p className="text-sm leading-relaxed text-foreground">
            {shared.join(", ")} tercatat di {cases.length} kasus yang sudah dibongkar pemeriksa fakta. Buka kasusnya
            dan cocokkan sendiri: apakah kontaknya benar sama dan modusnya serupa?
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {cases.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/70 dark:border-red-900"
            >
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{item.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.date} · sama: {item.shared.join(", ")}
                </span>
              </span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Kesamaan kontak bukan keputusan akhir: nomor bisa berpindah tangan atau dicatut. Karena itu temuan ini
        hanya menaikkan risiko sampai Sedang.
      </p>
    </section>
  );
}
