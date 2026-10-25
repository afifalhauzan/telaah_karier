"use client";

import { cn } from "@/utils/utils";
import { useQuotaStore } from "@/lib/quota-store";

// The open session turns yellow past 75% and red past 90%
const sessionTone = (share: number) => (share > 0.9 ? "red" : share > 0.75 ? "amber" : "primary");
const STROKES = { primary: "stroke-primary", amber: "stroke-amber-500", red: "stroke-red-500" };
const TEXTS = { primary: "text-muted-foreground", amber: "text-amber-700", red: "text-red-600" };

/** How much of the open session is used, as a donut, with its percentage. */
export function SessionDonut({ share }: { share: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const tone = sessionTone(share);
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", TEXTS[tone])}>
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r={radius} className="fill-none stroke-muted-foreground/25" strokeWidth="2.5" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          className={cn("fill-none transition-[stroke-dasharray]", STROKES[tone])}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * Math.min(share, 1)} ${circumference}`}
        />
      </svg>
      Sesi ini terpakai {Math.round(Math.min(share, 1) * 100)}%
    </span>
  );
}

/** One segment per session of the day: used ones filled (yellow at one left, red at none), the rest grey. */
function DaySegments({ used, limit, vertical = false }: { used: number; limit: number; vertical?: boolean }) {
  const fill = used >= limit ? "bg-red-500" : used >= limit - 1 ? "bg-amber-500" : "bg-primary";
  return (
    <div className={cn("flex gap-0.5", vertical ? "w-5 flex-col-reverse" : "w-full")} aria-hidden>
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn("rounded-full", vertical ? "h-1.5 w-full" : "h-1.5 flex-1", index < used ? fill : "bg-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

/** Today's sessions at the foot of the history panel; on the collapsed rail the bars alone, numbers in the tooltip. */
export function UsageMeter({ collapsed }: { collapsed: boolean }) {
  const { quota } = useQuotaStore();
  if (!quota || quota.guest) return null;

  if (quota.exempt) {
    return collapsed ? null : <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Sesi TelaahLoker tanpa batas</p>;
  }
  const limit = quota.sessionsLimit;
  if (limit === undefined) return null;
  const used = Math.min(quota.sessionsUsed ?? 0, limit);
  const summary = `Sesi hari ini ${used}/${limit}, direset pukul 00.00 WIB`;

  if (collapsed) {
    return (
      <div className="mt-auto pt-2" title={summary} aria-label={summary} role="img">
        <DaySegments used={used} limit={limit} vertical />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs" aria-label={summary}>
      <div className="flex items-center justify-between text-foreground">
        <span>Sesi hari ini</span>
        <span className="tabular-nums text-muted-foreground">
          {used}/{limit}
        </span>
      </div>
      <DaySegments used={used} limit={limit} />
      <p className="text-[11px] text-muted-foreground">Direset pukul 00.00 WIB.</p>
    </div>
  );
}
