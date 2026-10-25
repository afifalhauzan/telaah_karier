"use client";

import { cn } from "@/utils/utils";
import { SESSION_WARNING_SHARE, sessionShare, useQuotaStore } from "@/lib/quota-store";

/** How much of the open session is used, as a filling pie. */
function SessionPie({ share }: { share: number }) {
  // A stroke as wide as the radius fills the circle like a pie slice
  const radius = 4;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r="7.25" className="fill-none stroke-border" strokeWidth="1.5" />
      <circle
        cx="8"
        cy="8"
        r={radius}
        className={cn("fill-none transition-[stroke-dasharray]", share >= SESSION_WARNING_SHARE ? "stroke-amber-500" : "stroke-primary")}
        strokeWidth={radius * 2}
        strokeDasharray={`${circumference * Math.min(share, 1)} ${circumference}`}
      />
    </svg>
  );
}

/** One segment per session of the day, filled for the ones used. */
function DaySegments({ used, limit, vertical = false }: { used: number; limit: number; vertical?: boolean }) {
  return (
    <div className={cn("flex gap-0.5", vertical ? "w-5 flex-col-reverse" : "w-full")} aria-hidden>
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn(
            "rounded-full",
            vertical ? "h-1.5 w-full" : "h-1.5 flex-1",
            index < used ? (used >= limit ? "bg-amber-500" : "bg-primary") : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

/**
 * Today's sessions and the open session's share, at the bottom of the history panel. On the
 * collapsed rail the same two meters stand on their own, with the numbers in the tooltip.
 */
export function UsageMeter({ collapsed }: { collapsed: boolean }) {
  const { quota } = useQuotaStore();
  if (!quota) return null;

  const share = sessionShare(quota);
  const percent = Math.round(Math.min(share, 1) * 100);
  const limit = !quota.exempt ? quota.sessionsLimit : undefined;
  const used = limit !== undefined ? Math.min(quota.sessionsUsed ?? 0, limit) : 0;
  const summary = [limit !== undefined ? `Sesi hari ini ${used}/${limit}` : null, quota.exempt ? "Sesi tanpa batas" : `Sesi ini terpakai ${percent}%`]
    .filter(Boolean)
    .join(" · ");

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 py-2" title={summary} aria-label={summary} role="img">
        {limit !== undefined && <DaySegments used={used} limit={limit} vertical />}
        {!quota.exempt && <SessionPie share={share} />}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs" aria-label={summary}>
      {limit !== undefined && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-foreground">
            <span>Sesi hari ini</span>
            <span className="tabular-nums text-muted-foreground">
              {used}/{limit}
            </span>
          </div>
          <DaySegments used={used} limit={limit} />
        </div>
      )}
      {quota.exempt ? (
        <p className="text-muted-foreground">Sesi TelaahLoker tanpa batas</p>
      ) : (
        <div className="flex items-center gap-2 text-foreground">
          <SessionPie share={share} />
          <span>Sesi ini terpakai</span>
          <span className={cn("ml-auto tabular-nums", share >= SESSION_WARNING_SHARE ? "text-amber-700" : "text-muted-foreground")}>{percent}%</span>
        </div>
      )}
      {limit !== undefined && <p className="text-[11px] text-muted-foreground">Direset pukul 00.00 WIB.</p>}
    </div>
  );
}
