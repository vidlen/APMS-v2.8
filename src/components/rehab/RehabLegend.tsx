import { CalendarClock } from "lucide-react";
import { REHAB_YEARS, REHAB_YEAR_COLORS, type RehabYear } from "@/lib/rehab";

interface RehabLegendProps {
  activeYears: Set<RehabYear>;
  onToggleYear: (year: RehabYear) => void;
  onClearYears: () => void;
  yearCounts: Record<RehabYear, number>;
}

export default function RehabLegend({ activeYears, onToggleYear, onClearYears, yearCounts }: RehabLegendProps) {
  const filtering = activeYears.size > 0;
  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="text-muted-foreground" />
          <h2 className="panel-label">Priority Year</h2>
        </div>
        {filtering && (
          <button
            onClick={onClearYears}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="space-y-1">
        {REHAB_YEARS.map((year) => {
          const count = yearCounts[year] ?? 0;
          const isActive = activeYears.has(year);
          const isDimmed = filtering && !isActive;
          return (
            <button
              key={year}
              onClick={() => onToggleYear(year)}
              disabled={count === 0}
              title={count === 0 ? `No branches in ${year}` : `Show only ${year} branches`}
              className={`w-full flex items-center gap-3.5 py-1.5 px-1.5 -mx-1.5 rounded-md text-left transition-all disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/60"
              } ${isDimmed ? "opacity-45" : ""}`}
            >
              <span
                className="pci-swatch w-4 h-4 rounded-[5px] shrink-0"
                style={{ backgroundColor: REHAB_YEAR_COLORS[year] }}
              />
              <span className="text-sm text-muted-foreground flex items-baseline gap-2 flex-1 min-w-0">
                <span className="font-medium text-foreground">{year}</span>
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
