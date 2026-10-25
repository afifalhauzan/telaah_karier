import {
  Banknote,
  Building2,
  Link2,
  ListChecks,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import type { AnalysisAction } from "@/types/ui-actions";

// Chip widths for an even, centered layout: two per row on phones; on wider screens one row for up
// to four, and five as three over two. gap-2 is 0.5rem between chips.
const PHONE_WIDTH = "w-[calc((100%-0.5rem)/2)]";
const WIDE_WIDTH: Record<number, string> = {
  1: "sm:w-full",
  2: "sm:w-[calc((100%-0.5rem)/2)]",
  3: "sm:w-[calc((100%-1rem)/3)]",
  4: "sm:w-[calc((100%-1.5rem)/4)]",
  5: "sm:w-[calc((100%-1rem)/3)]",
};

interface AnalysisActionsProps {
  messageId: string;
  actions: AnalysisAction[];
  onActionClick: (action: AnalysisAction, sourceMessageId?: string) => void;
  isLoading?: boolean;
  pendingActionId?: string | null;
}

export function AnalysisActions({
  messageId,
  actions,
  onActionClick,
  isLoading = false,
  pendingActionId = null,
}: AnalysisActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <p className="text-xs font-medium text-primary">Aksi Investigasi Lanjutan</p>
      <div className="flex flex-wrap justify-center gap-2">
        {actions.map((action) => {
          const isActionPending = pendingActionId === action.id && isLoading;
          const isDisabled = isLoading;
          const Icon = {
            validate_company: Building2,
            check_red_flags: ShieldAlert,
            check_link_contact: Link2,
            check_salary_benefit_reasonableness: Banknote,
            safe_next_steps: ListChecks,
          }[action.id];

          return (
            <button
              key={`${messageId}-${action.id}`}
              type="button"
              onClick={() => onActionClick(action, messageId)}
              disabled={isDisabled}
              title={action.description}
              className={`inline-flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70 ${actions.length === 1 ? "w-full" : PHONE_WIDTH} ${WIDE_WIDTH[actions.length] ?? WIDE_WIDTH[3]}`}
            >
              {isActionPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
