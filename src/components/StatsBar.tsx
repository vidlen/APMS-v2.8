import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { SectionData } from "@/lib/pci-utils";
import { pciCategories, countByCondition, averagePci } from "@/lib/pci-utils";

interface StatsBarProps {
  sections: SectionData[];
  onOpenTable: () => void;
}

export default function StatsBar({ sections, onOpenTable }: StatsBarProps) {
  const stats = useMemo(() => {
    const total = sections.length;
    const avgPCI = averagePci(sections);
    const counts = countByCondition(sections);
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return { total, avgPCI: avgPCI.toFixed(1), dominant: dominant?.[0] || "N/A", counts };
  }, [sections]);

  // Read from the frozen ramp rather than hardcoding the hex, so this can
  // never drift from pciCategories.
  const satisfactoryColor = pciCategories.find((c) => c.label === "Satisfactory")?.color;

  return (
    <div className="px-5 py-5 border-b border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="panel-label">Network overview</h2>
        <button
          onClick={onOpenTable}
          className="flex items-center gap-1 p-2 -m-2 rounded-sm text-[11px] font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap"
          title="Browse all sections in a sortable table"
        >
          All sections
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
        <div className="flex-1 flex flex-col items-center gap-1 px-2">
          <div
            className="font-mono text-lg font-bold tabular-nums leading-tight text-foreground"
            style={satisfactoryColor ? { color: satisfactoryColor } : undefined}
          >
            {stats.avgPCI}
          </div>
          <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">Average PCI</div>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 px-2 last:pr-0">
          <div className="font-condensed text-[14px] font-semibold uppercase text-foreground leading-tight text-center truncate w-full">
            {stats.dominant}
          </div>
          <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">Dominant</div>
        </div>
      </div>

      {/* Condition distribution across all sections */}
      <div className="mt-4">
        <div className="h-[9px] rounded-full overflow-hidden flex gap-[2px] bg-border/40">
          {pciCategories.map((cat) => {
            const count = stats.counts[cat.label] ?? 0;
            if (count === 0 || stats.total === 0) return null;
            return (
              <div
                key={cat.label}
                title={`${cat.label}: ${count}`}
                className="h-full rounded-full"
                style={{ width: `${(count / stats.total) * 100}%`, backgroundColor: cat.color }}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {pciCategories.map((cat) => {
            const count = stats.counts[cat.label] ?? 0;
            if (count === 0) return null;
            return (
              <div key={cat.label} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-foreground font-medium font-mono tabular-nums">{count}</span>
                <span>{cat.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
