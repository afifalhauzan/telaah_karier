import { ExternalLink, FileSearch } from "lucide-react";
import type { SimilarCase } from "@/langchain/agents/analyzer/schema";

const MODUS_LABELS: Record<string, string> = {
  impersonasi: "mencatut nama",
  biaya: "meminta biaya",
  tugas_deposit: "tugas berbayar dan deposit",
  data_sensitif: "meminta data pribadi",
  tppo: "indikasi TPPO",
  gaji_tidak_wajar: "gaji tidak wajar",
  lainnya: "lainnya",
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Fact-checked scams that look like the posting, to compare against; looking alike proves nothing. */
export function SimilarCasesCard({ cases }: { cases: SimilarCase[] }) {
  return (
    <section className="rounded-xl border border-input bg-background p-4">
      <div className="flex items-start gap-2.5">
        <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Kasus serupa yang sudah dibongkar pemeriksa fakta</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Mirip bukan berarti palsu: lowongan asli pun mirip dengan versi palsunya. Bandingkan modus dan kanalnya.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {cases.map((item) => (
          <li key={item.url} className="rounded-lg border border-border bg-card p-3">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-2 text-sm font-medium text-foreground hover:text-primary"
            >
              <span className="min-w-0">{item.title}</span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
            </a>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hostOf(item.url)} · {item.date}
              {item.entity ? ` · mencatut ${item.entity}` : ""}
            </p>
            {(item.modus.length > 0 || item.channels.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.modus.map((modus) => (
                  <span key={modus} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {MODUS_LABELS[modus] ?? modus}
                  </span>
                ))}
                {item.channels.map((channel) => (
                  <span key={channel} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {channel}
                  </span>
                ))}
              </div>
            )}
            {item.traits.length > 0 && <p className="mt-2 text-xs leading-relaxed text-foreground">Ciri: {item.traits.join("; ")}.</p>}
            {item.officialRoute && (
              <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Jalur resmi: {item.officialRoute}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
