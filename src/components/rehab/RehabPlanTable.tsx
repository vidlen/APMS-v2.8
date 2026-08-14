import { useMemo, useState } from "react";
import { Search, ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import type { SectionData } from "@/lib/pci-utils";
import { REHAB_YEARS, REHAB_YEAR_COLORS, formatIdrCompact, type RehabPlanItem, type RehabYear } from "@/lib/rehab";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RehabPlanTableProps {
  plan: RehabPlanItem[];
  activeYears: Set<RehabYear>;
  onClearYears: () => void;
  selectedSection: SectionData | null;
  onSelect: (section: SectionData) => void;
  onClose: () => void;
}

type SortKey = "Section" | "PCI" | "Treatment" | "Year" | "Cost";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "Section", label: "Section" },
  { key: "PCI", label: "PCI" },
  { key: "Treatment", label: "Treatment" },
  { key: "Year", label: "Priority" },
  { key: "Cost", label: "Funds", title: "Placeholder estimate - not a real cost projection" },
];

export default function RehabPlanTable({
  plan,
  activeYears,
  onClearYears,
  selectedSection,
  onSelect,
  onClose,
}: RehabPlanTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("Year");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = plan.filter((item) => {
      if (
        q &&
        !(
          item.section.Section.toLowerCase().includes(q) ||
          item.section.Type.toLowerCase().includes(q) ||
          item.treatment.toLowerCase().includes(q)
        )
      )
        return false;
      if (activeYears.size > 0 && !activeYears.has(item.priorityYear)) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      if (sortKey === "PCI") return (a.pci - b.pci) * dir;
      if (sortKey === "Treatment") return a.treatment.localeCompare(b.treatment) * dir;
      if (sortKey === "Cost") return (a.costIdr - b.costIdr) * dir;
      if (sortKey === "Year") {
        const yearRank = REHAB_YEARS.indexOf(a.priorityYear) - REHAB_YEARS.indexOf(b.priorityYear);
        return (yearRank || a.pci - b.pci) * dir;
      }
      return a.section.Section.localeCompare(b.section.Section) * dir;
    });
  }, [plan, query, activeYears, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground">
            5-Year Rehabilitation Plan{" "}
            <span className="text-muted-foreground font-normal">
              ({rows.length}
              {rows.length !== plan.length ? ` of ${plan.length}` : ""})
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close table view"
            className="p-1.5 -m-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Close table view"
          >
            <X size={16} />
          </button>
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter branches or treatment..."
            className="h-8 pl-7 text-xs"
          />
        </div>
        {activeYears.size > 0 && (
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground">Filtered:</span>
            {[...activeYears].map((y) => (
              <span key={y} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                {y}
              </span>
            ))}
            <button
              onClick={onClearYears}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className="px-1.5"
                title={col.title}
                aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
              >
                <button
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-1 h-full w-full text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                >
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={11} className="opacity-30" />
                  )}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const isActive = selectedSection?.Section === item.section.Section;
            return (
              <TableRow
                key={item.section.Section}
                onClick={() => {
                  onSelect(item.section);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item.section);
                    onClose();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View rehabilitation detail for ${item.section.Section}`}
                className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isActive ? "bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))]" : ""}`}
              >
                <TableCell className="p-1.5 font-medium font-mono text-xs text-foreground">
                  {item.section.Section}
                </TableCell>
                <TableCell className="p-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                  {item.section["PCI Rating"]}
                </TableCell>
                <TableCell className="p-1.5 text-xs text-muted-foreground">{item.treatment}</TableCell>
                <TableCell className="p-1.5">
                  <span
                    className="pci-swatch inline-flex items-center justify-center min-w-9 px-1.5 h-6 rounded text-[11px] font-bold font-mono tabular-nums text-foreground"
                    style={{ backgroundColor: REHAB_YEAR_COLORS[item.priorityYear] }}
                  >
                    {item.priorityYear === "Not Scheduled" ? "—" : item.priorityYear.replace("Year ", "Y")}
                  </span>
                </TableCell>
                <TableCell className="p-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                  {item.costIdr > 0 ? formatIdrCompact(item.costIdr) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="text-center text-muted-foreground py-8 whitespace-normal">
                No branches match your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
