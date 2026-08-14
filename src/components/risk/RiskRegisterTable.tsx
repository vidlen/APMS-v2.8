import { useMemo, useState } from "react";
import { Search, ArrowUp, ArrowDown, ArrowUpDown, Info, Download, X, SlidersHorizontal } from "lucide-react";
import type { BranchRiskResult } from "@/lib/risk";
import { metricValue, type DistressTally } from "@/lib/dominant-distress";
import { ROLE_LABELS, DOMINANT_DISTRESS_METRIC, type BranchRole, type DistressSource } from "@/config/riskScales";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RiskRegisterTableProps {
  results: BranchRiskResult[];
  /** branchId -> role, from the same inputs that produced `results` (risk-adapter.ts). */
  roleByBranch: Record<string, BranchRole>;
  /** branchId -> top 3 repair-log distresses by DOMINANT_DISTRESS_METRIC, for
   *  the trace popover (brief 8.2). Absent for a branch with no log records. */
  topLogDistressesByBranch?: Record<string, DistressTally[]>;
  /** Controlled by RiskTab so the risk map (backlog F) can filter the register on a click. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Exact ICAO cell (e.g. '4B') from the matrix panel (backlog H) - null when not filtering by cell. */
  cellFilter: string | null;
  onClearCellFilter: () => void;
}

const HAZARD_LABELS: Record<string, string> = {
  fod: "FOD",
  friction: "Friction",
  structural: "Structural",
  other: "Other",
};

const TIER_LABELS: Record<string, string> = {
  markov: "Markov (Tier 1)",
  curve: "Forecast (Tier 2)",
  pci: "Current PCI (Tier 3)",
};

// Section 8, riskScales.ts: where a branch's dominant distress came from.
// 'none' reads as a visible gap in the register, not a blank cell.
const DISTRESS_SOURCE_LABELS: Record<DistressSource, string> = {
  admin: "Admin",
  units: "PCI units",
  log: "Repair log",
  inventory: "Inventory",
  none: "No evidence",
};

const DISTRESS_SOURCE_TITLES: Record<DistressSource, string> = {
  admin: "Set explicitly in Admin -> Risk Inventory",
  units: "PCI sample units, aggregated by total ASTM D5340 deduct",
  log: "The repair log, aggregated by severity x area",
  inventory: "The reviewed two-row table (06/24, 07L/25R only)",
  none: "No evidence from any source - hazard class falls back to 'other'",
};

const METRIC_UNIT_LABELS: Record<string, string> = {
  count: "records",
  area: "m2",
  severity_area: "severity x area",
  deduct: "deduct",
};

// Worst-first ordering for the ICAO zone / detectability columns - lets
// "sort by zone" mean something (group the branches needing attention
// first), matching how R already sorts worst-first by default.
const ZONE_RANK: Record<string, number> = { Intolerable: 0, Tolerable: 1, Acceptable: 2 };
const DETECTABILITY_RANK: Record<string, number> = { hidden: 0, moderate: 1, visible: 2 };

type SortKey = "branch" | "role" | "distress" | "L" | "F" | "C" | "R" | "degree" | "zone" | "detect";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "branch", label: "Branch" },
  { key: "role", label: "Role" },
  {
    key: "distress",
    label: "Distress",
    title: "Dominant distress and its source, first hit wins: admin override, PCI sample units, repair log, reviewed inventory",
  },
  { key: "L", label: "L" },
  { key: "F", label: "F" },
  { key: "C", label: "C" },
  { key: "R", label: "R", title: "Fine-Kinney score - orders the register, comparison only" },
  { key: "degree", label: "FK", title: "Fine-Kinney degree - literature comparison, not a verdict" },
  { key: "zone", label: "ICAO Zone", title: "ICAO Doc 9859 tolerability - the operational verdict" },
  {
    key: "detect",
    label: "Detect.",
    title: "Detectability - a label inferred from hazard class; only escalates the score when explicitly set in Admin",
  },
];

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: BranchRiskResult[], roleLabel: (r: BranchRiskResult) => string) {
  const header = [
    "Branch", "Role", "Dominant Distress", "Distress Source", "Hazard Class",
    "Likelihood", "Frequency", "Consequence",
    "R", "FK Degree", "ICAO Cell", "ICAO Zone", "Likelihood Tier", "Detectability",
    "Detectability Applied", "Expert Override Applied", "Recommended Action", "Trace",
  ];
  const lines = rows.map((r) =>
    [
      r.branchName,
      roleLabel(r),
      r.dominantDistress ?? "",
      DISTRESS_SOURCE_LABELS[r.distressSource ?? "none"],
      HAZARD_LABELS[r.hazardClass] ?? r.hazardClass,
      r.likelihood,
      r.frequency,
      r.consequence,
      r.riskScore.toFixed(1),
      r.band.degree,
      r.icao.cell,
      r.icao.zone,
      TIER_LABELS[r.likelihoodTier] ?? r.likelihoodTier,
      r.detectability,
      r.detectabilityApplied ? `yes (+${r.detectabilityEscalationSteps})` : "no (inferred only)",
      r.overridden ? "yes" : "no",
      r.recommendedAction,
      r.trace.join(" | "),
    ]
      .map((v) => csvCell(String(v)))
      .join(","),
  );
  const csv = [header.map(csvCell).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function RiskRegisterTable({
  results,
  roleByBranch,
  topLogDistressesByBranch = {},
  query,
  onQueryChange,
  cellFilter,
  onClearCellFilter,
}: RiskRegisterTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("R");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const roleLabel = (r: BranchRiskResult) => ROLE_LABELS[roleByBranch[r.branchId]] ?? "Unknown";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = results.filter((r) => {
      if (cellFilter && r.icao.cell !== cellFilter) return false;
      if (!q) return true;
      return (
        r.branchName.toLowerCase().includes(q) ||
        roleLabel(r).toLowerCase().includes(q) ||
        r.icao.zone.toLowerCase().includes(q)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "branch":
          return a.branchName.localeCompare(b.branchName) * dir;
        case "role":
          return roleLabel(a).localeCompare(roleLabel(b)) * dir;
        case "distress":
          // Branches with no evidence sort together at whichever end 'zzz'
          // lands on, rather than interleaving with real distress names.
          return (a.dominantDistress ?? "zzz").localeCompare(b.dominantDistress ?? "zzz") * dir;
        case "L":
          return (a.likelihood - b.likelihood) * dir;
        case "F":
          return (a.frequency - b.frequency) * dir;
        case "C":
          return (a.consequence - b.consequence) * dir;
        case "degree":
          return (a.band.degree - b.band.degree) * dir;
        case "zone":
          return (ZONE_RANK[a.icao.zone] - ZONE_RANK[b.icao.zone]) * dir;
        case "detect":
          return (DETECTABILITY_RANK[a.detectability] - DETECTABILITY_RANK[b.detectability]) * dir;
        case "R":
        default:
          return (a.riskScore - b.riskScore) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, roleByBranch, query, cellFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "R" || key === "degree" ? "desc" : "asc");
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border overflow-hidden">
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="relative w-64 max-w-full">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Filter by branch, role, or zone..."
            className="h-8 pl-7 pr-7 text-xs"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {cellFilter && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-muted-foreground">Cell:</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium font-mono">
              {cellFilter}
            </span>
            <button
              onClick={onClearCellFilter}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              Clear
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {rows.length}
            {rows.length !== results.length ? ` of ${results.length}` : ""} branches
          </span>
          <button
            onClick={() => downloadCsv("risk-register.csv", rows, roleLabel)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-foreground border border-border hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Export the current filtered/sorted rows as CSV"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((col) => (
                <TableHead key={col.key} className="px-2" title={col.title}>
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 h-full w-full text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                    ) : (
                      <ArrowUpDown size={11} className="opacity-30" />
                    )}
                  </button>
                </TableHead>
              ))}
              <TableHead className="px-2 w-8" aria-label="Trace" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.branchId}>
                <TableCell className="px-2 py-1.5 font-medium font-mono text-xs text-foreground whitespace-nowrap">
                  {r.branchName}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  {roleLabel(r)}
                </TableCell>
                <TableCell className="px-2 py-1.5 text-xs whitespace-nowrap">
                  {r.dominantDistress ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-foreground">{r.dominantDistress}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase tracking-wide shrink-0"
                        title={DISTRESS_SOURCE_TITLES[r.distressSource ?? "none"]}
                      >
                        {DISTRESS_SOURCE_LABELS[r.distressSource ?? "none"]}
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-muted-foreground italic"
                      title={DISTRESS_SOURCE_TITLES.none}
                    >
                      No evidence
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-foreground">
                  {r.likelihood}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-foreground">
                  {r.frequency}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-foreground">
                  {r.consequence}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                  <span className="inline-flex items-center gap-1">
                    {r.riskScore.toFixed(1)}
                    {r.overridden && (
                      <span title="Expert override applied to L, F, or C - see the trace for details">
                        <SlidersHorizontal size={11} className="text-primary shrink-0" aria-label="Expert override applied" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <span
                    className="pci-swatch inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold font-mono"
                    style={{ backgroundColor: r.band.color, color: "#fff" }}
                    title={`${r.band.situation} (comparison only)`}
                  >
                    {r.band.degree}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <span
                    className="pci-swatch inline-flex items-center gap-1.5 px-2 h-6 rounded text-[11px] font-bold font-mono whitespace-nowrap"
                    style={{ backgroundColor: r.icao.zoneColor, color: "#fff" }}
                    title={`Cell ${r.icao.cell}: probability ${r.icao.probabilityLabel}, severity ${r.icao.severityLabel}. ${r.recommendedAction}`}
                  >
                    {r.icao.cell}
                    <span className="font-sans font-normal opacity-90">{r.icao.zone}</span>
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <span
                    className={`text-xs whitespace-nowrap ${
                      r.detectabilityApplied ? "font-semibold text-foreground" : "text-muted-foreground italic"
                    }`}
                    title={
                      r.detectabilityApplied
                        ? `Explicit override: raised L by ${r.detectabilityEscalationSteps} step${r.detectabilityEscalationSteps === 1 ? "" : "s"}`
                        : "Inferred from hazard class - not applied to the score. Set explicitly in Admin → Risk Inventory to apply it."
                    }
                  >
                    {r.detectability[0].toUpperCase() + r.detectability.slice(1)}
                    {r.detectabilityApplied && r.detectabilityEscalationSteps > 0
                      ? ` (+${r.detectabilityEscalationSteps})`
                      : ""}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        title="Show how this score was computed"
                        aria-label={`Show trace for ${r.branchName}`}
                      >
                        <Info size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 text-xs" align="end">
                      <p className="font-condensed font-semibold uppercase tracking-wide text-[11px] text-muted-foreground mb-2">
                        {r.branchName} - trace ({TIER_LABELS[r.likelihoodTier] ?? r.likelihoodTier})
                      </p>
                      <p
                        className="text-foreground font-medium rounded px-2 py-1.5 mb-2"
                        style={{ backgroundColor: `${r.icao.zoneColor}26` }}
                      >
                        {r.recommendedAction}
                      </p>
                      <ul className="space-y-1.5">
                        {r.trace.map((line, i) => (
                          <li key={i} className="text-foreground/90 leading-snug">
                            {line}
                          </li>
                        ))}
                      </ul>
                      {(topLogDistressesByBranch[r.branchId]?.length ?? 0) > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-border">
                          <p className="font-condensed font-semibold uppercase tracking-wide text-[10px] text-muted-foreground mb-1.5">
                            Top distresses, repair log ({METRIC_UNIT_LABELS[DOMINANT_DISTRESS_METRIC]})
                          </p>
                          <ul className="space-y-1">
                            {topLogDistressesByBranch[r.branchId].map((t) => (
                              <li
                                key={t.distress}
                                className="flex items-center justify-between gap-2 text-foreground/90"
                              >
                                <span>{t.distress}</span>
                                <span className="font-mono tabular-nums text-muted-foreground">
                                  {metricValue(t, DOMINANT_DISTRESS_METRIC).toFixed(1)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 1} className="text-center text-muted-foreground py-8">
                  No branches match your filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
