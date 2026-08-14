import { X, Wrench, CalendarClock, Layers, Banknote } from "lucide-react";
import { pciCategories, getPCICategory } from "@/lib/pci-utils";
import { REHAB_YEARS, REHAB_YEAR_COLORS, REHAB_TRIGGER_PCI, formatIdr, type RehabPlanItem } from "@/lib/rehab";
import { parseConstructionYear, parseDimension } from "@/lib/section-meta-utils";

interface RehabDetailPanelProps {
  item: RehabPlanItem;
  onClose: () => void;
}

const SCHEDULED_YEARS = REHAB_YEARS.filter((y) => y !== "Not Scheduled");

export default function RehabDetailPanel({ item, onClose }: RehabDetailPanelProps) {
  const { section, pci, treatment, priorityYear, costIdr } = item;
  const condition = getPCICategory(pci);
  const constructionYear = section["Last Major Construction Year"]
    ? parseConstructionYear(section["Last Major Construction Year"])
    : null;
  const dimension = section.Dimension ? parseDimension(section.Dimension) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-border">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="pci-swatch w-[54px] h-[54px] rounded-md flex items-center justify-center text-[11px] font-bold font-mono tabular-nums shrink-0 text-foreground text-center leading-tight"
            style={{ backgroundColor: REHAB_YEAR_COLORS[priorityYear] }}
          >
            {priorityYear === "Not Scheduled" ? "N/A" : priorityYear.replace("Year ", "Y")}
          </div>
          <div className="min-w-0">
            <h2 className="text-foreground font-condensed font-semibold text-[27px] uppercase tracking-[.05em] leading-none truncate">
              {section.Section}
            </h2>
            <p className="text-muted-foreground text-xs mt-2">Rehabilitation Detail · {priorityYear}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="w-8 h-8 rounded-md bg-secondary hover:bg-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-5">
        {/* Recommended treatment */}
        <section className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={14} className="text-muted-foreground" />
            <h3 className="panel-label">Recommended Treatment</h3>
          </div>
          <p className="text-foreground text-lg font-semibold">{treatment}</p>
          <p className="text-muted-foreground text-xs mt-1">Planning-level, based on current PCI</p>
        </section>

        {/* PCI at last inspection */}
        <section className="py-5 border-t border-border">
          <h3 className="panel-label mb-3">PCI at Last Inspection</h3>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-3xl font-bold font-mono text-foreground tabular-nums">
              {section["PCI Rating"]}
            </span>
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full mb-1.5"
              style={{ backgroundColor: condition.color, color: condition.textColor }}
            >
              {condition.label}
            </span>
          </div>
          <div className="h-2 bg-border/60 rounded-full overflow-hidden flex">
            {pciCategories.map((cat) => (
              <div
                key={cat.min}
                className="h-full"
                style={{ width: `${cat.max - cat.min}%`, backgroundColor: cat.color }}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Treatment triggers once PCI falls to {REHAB_TRIGGER_PCI} or below.
          </p>
        </section>

        {/* Priority timeline */}
        <section className="py-5 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={14} className="text-muted-foreground" />
            <h3 className="panel-label">Priority Timeline</h3>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {SCHEDULED_YEARS.map((year) => {
              const isCurrent = year === priorityYear;
              return (
                <div
                  key={year}
                  className={`rounded-md border px-1 py-2 flex flex-col items-center justify-center gap-0.5 ${
                    isCurrent ? "border-primary ring-1 ring-primary/40" : "border-border"
                  }`}
                  style={{ backgroundColor: isCurrent ? REHAB_YEAR_COLORS[year] : undefined }}
                >
                  <span
                    className={`text-[10px] font-bold font-mono ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {year.replace("Year ", "Y")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Funds needed */}
        <section className="py-5 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Banknote size={14} className="text-muted-foreground" />
            <h3 className="panel-label">Funds Needed</h3>
          </div>
          <p className="text-foreground text-2xl font-bold font-mono tabular-nums">
            {costIdr > 0 ? formatIdr(costIdr) : "—"}
          </p>
        </section>

        {/* Last Major Construction */}
        {constructionYear && (
          <section className="py-5 border-t border-border">
            <h3 className="panel-label mb-3">Last Major Construction</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-foreground text-2xl font-bold font-mono tabular-nums">
                {constructionYear.year}
              </span>
              {constructionYear.caption && (
                <span className="text-muted-foreground text-sm">{constructionYear.caption}</span>
              )}
            </div>
          </section>
        )}

        {/* Dimension */}
        {dimension && (
          <section className="py-5 border-t border-border">
            <h3 className="panel-label mb-4">Dimension</h3>
            {dimension.kind === "linear" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border px-3 py-2.5 flex flex-col items-center justify-center gap-0.5">
                  <div className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold leading-none">
                    Length
                  </div>
                  <div className="text-foreground font-bold text-base font-mono leading-none tabular-nums">
                    {dimension.length} m
                  </div>
                </div>
                <div className="rounded-md border border-border px-3 py-2.5 flex flex-col items-center justify-center gap-0.5">
                  <div className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold leading-none">
                    Width
                  </div>
                  <div className="text-foreground font-bold text-base font-mono leading-none tabular-nums">
                    {dimension.width} m
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border px-3 py-2.5 flex flex-col items-center justify-center gap-0.5 max-w-[140px]">
                <div className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-semibold leading-none">
                  Area
                </div>
                <div className="text-foreground font-bold text-base font-mono leading-none tabular-nums">
                  {dimension.area.toLocaleString()} m²
                </div>
              </div>
            )}
          </section>
        )}

        {/* Type */}
        <section className="py-5 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={14} className="text-muted-foreground" />
            <h3 className="panel-label">Pavement Type</h3>
          </div>
          <p className="text-foreground text-base font-medium">{section.Type}</p>
        </section>
      </div>
    </div>
  );
}
