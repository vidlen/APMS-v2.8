import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { REHAB_YEARS, REHAB_YEAR_COLORS, formatIdrCompact, type RehabPlanItem } from "@/lib/rehab";

interface RehabStatsBarProps {
  plan: RehabPlanItem[];
  onOpenTable: () => void;
}

export default function RehabStatsBar({ plan, onOpenTable }: RehabStatsBarProps) {
  const stats = useMemo(() => {
    const total = plan.length;
    const scheduled = plan.filter((p) => p.priorityYear !== "Not Scheduled").length;
    const totalCostIdr = plan.reduce((sum, p) => sum + p.costIdr, 0);
    const counts = REHAB_YEARS.reduce(
      (acc, y) => {
        acc[y] = plan.filter((p) => p.priorityYear === y).length;
        return acc;
      },
      {} as Record<string, number>
    );
    return { total, scheduled, totalCostIdr, counts };
  }, [plan]);

  return (
    <div className="px-5 py-5 border-b border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="panel-label">5-year rehabilitation needs</h2>
        <button
          onClick={onOpenTable}
          className="flex items-center gap-1 p-2 -m-2 rounded-sm text-[11px] font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
          title="Browse the full rehabilitation plan in a sortable table"
        >
          Full plan
          <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex divide-x divide-border">
        <div className="flex-1 flex flex-col items-center gap-1 px-2 first:pl-0 last:pr-0">
          <div className="font-mono text-lg font-bold text-foreground tabular-nums leading-tight">
            {stats.total}
          </div>
          <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">Branches</div>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 px-2 last:pr-0">
          <div className="font-mono text-lg font-bold tabular-nums leading-tight text-foreground">
            {stats.scheduled}
          </div>
          <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">Need M&amp;R</div>
        </div>
      </div>

      {/* Funds needed - placeholder estimate, see the disclaimer below */}
      <div className="mt-4 rounded-md border border-dashed border-border px-3 py-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] tracking-[.07em] uppercase text-muted-foreground">Est. Funds Needed</span>
        <span className="font-mono text-base font-bold tabular-nums text-foreground">
          {formatIdrCompact(stats.totalCostIdr)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/70 italic mt-1.5">
        Placeholder estimate for demonstration only — not a real cost projection.
      </p>

      {/* Distribution across the 5-year window */}
      <div className="mt-4">
        <div className="h-[9px] rounded-full overflow-hidden flex gap-[2px] bg-border/40">
          {REHAB_YEARS.map((year) => {
            const count = stats.counts[year] ?? 0;
            if (count === 0 || stats.total === 0) return null;
            return (
              <div
                key={year}
                title={`${year}: ${count}`}
                className="h-full rounded-full"
                style={{ width: `${(count / stats.total) * 100}%`, backgroundColor: REHAB_YEAR_COLORS[year] }}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {REHAB_YEARS.map((year) => {
            const count = stats.counts[year] ?? 0;
            if (count === 0) return null;
            return (
              <div key={year} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: REHAB_YEAR_COLORS[year] }}
                />
                <span className="text-foreground font-medium font-mono tabular-nums">{count}</span>
                <span>{year}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
