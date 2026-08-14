import { Wrench, ChevronRight } from "lucide-react";
import type { SectionData } from "@/lib/pci-utils";
import { REHAB_YEAR_COLORS, type RehabPlanItem } from "@/lib/rehab";

interface RehabPriorityListProps {
  plan: RehabPlanItem[];
  onSelect: (section: SectionData) => void;
  onShowAll: () => void;
}

const MAX_ITEMS = 5;

export default function RehabPriorityList({ plan, onSelect, onShowAll }: RehabPriorityListProps) {
  // Year 1 first, worst PCI within a year first - the same order the map
  // legend and full plan table read top to bottom.
  const scheduled = plan
    .filter((p) => p.priorityYear !== "Not Scheduled")
    .sort((a, b) => a.priorityYear.localeCompare(b.priorityYear) || a.pci - b.pci);

  if (scheduled.length === 0) {
    return (
      <div className="px-5 py-5 border-b border-border">
        <h2 className="panel-label mb-3 flex items-center gap-2">
          <Wrench size={14} className="text-muted-foreground" />
          Rehabilitation priority
        </h2>
        <p className="text-muted-foreground text-xs">No branches currently trigger a rehabilitation need.</p>
      </div>
    );
  }

  const shown = scheduled.slice(0, MAX_ITEMS);
  const remaining = scheduled.length - shown.length;

  return (
    <div className="px-5 py-5 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="panel-label flex items-center gap-2">
          <Wrench size={14} className="text-muted-foreground" />
          Rehabilitation priority
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{scheduled.length}</span>
      </div>
      <div>
        {shown.map((item) => (
          <button
            key={item.section.Section}
            onClick={() => onSelect(item.section)}
            className="hairline-row w-full flex items-center gap-3 py-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <div
              className="pci-swatch w-10 h-7 rounded-md flex items-center justify-center text-[10px] font-bold font-mono tabular-nums shrink-0 text-foreground"
              style={{ backgroundColor: REHAB_YEAR_COLORS[item.priorityYear] }}
            >
              {item.priorityYear.replace("Year ", "Y")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-foreground text-sm font-medium font-mono truncate">{item.section.Section}</div>
              <div className="text-muted-foreground text-[11px] truncate">
                {item.treatment} · PCI {Math.round(item.pci)}
              </div>
            </div>
            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
      {remaining > 0 && (
        <button
          onClick={onShowAll}
          className="w-full text-primary hover:text-primary/80 text-[11px] mt-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          +{remaining} more branch{remaining === 1 ? "" : "es"} in the plan
        </button>
      )}
    </div>
  );
}
