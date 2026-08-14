import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Minus, TrendingUp, TrendingDown } from "lucide-react";
import {
  comparePriorityOrders,
  findDegreeZoneDisagreements,
  type BranchRiskInput,
  type BranchRiskResult,
} from "@/lib/risk";
import { ROLE_LABELS, type BranchRole } from "@/config/riskScales";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ComparisonViewsProps {
  inputs: BranchRiskInput[];
  results: BranchRiskResult[];
  roleByBranch: Record<string, BranchRole>;
  /** Reuses the matrix panel's register filter (backlog H) so a disagreement row can jump straight to it. */
  onSelectCell: (cell: string | null) => void;
}

type SortKey = "branch" | "pciRank" | "riskRank" | "movement" | "riskScore";
type SortDir = "asc" | "desc";

const PRIORITY_COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "branch", label: "Branch" },
  { key: "pciRank", label: "PCI Rank", title: "Rank by current PCI alone, worst first" },
  { key: "riskRank", label: "Risk Rank", title: "Rank by Fine-Kinney R, worst first" },
  {
    key: "movement",
    label: "Movement",
    title: "PCI rank minus risk rank - positive means risk promoted the branch to more urgent than PCI alone would",
  },
  { key: "riskScore", label: "R" },
];

function PciVsRiskTable({ inputs }: { inputs: BranchRiskInput[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("movement");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const comparison = useMemo(() => comparePriorityOrders(inputs), [inputs]);

  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return comparison.slice().sort((a, b) => {
      switch (sortKey) {
        case "branch":
          return a.branchName.localeCompare(b.branchName) * dir;
        case "pciRank":
          return (a.pciRank - b.pciRank) * dir;
        case "riskRank":
          return (a.riskRank - b.riskRank) * dir;
        case "riskScore":
          return (a.riskScore - b.riskScore) * dir;
        case "movement":
        default:
          return (a.movement - b.movement) * dir;
      }
    });
  }, [comparison, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-card border-b border-border px-4 py-3">
        <h3 className="panel-label">PCI order vs risk order</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Where ranking by risk moves a branch away from where its PCI alone would rank it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {PRIORITY_COLUMNS.map((col) => (
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.branchId}>
                <TableCell className="px-2 py-1.5 font-medium font-mono text-xs text-foreground whitespace-nowrap">
                  {r.branchName}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {r.pciRank}
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {r.riskRank}
                </TableCell>
                <TableCell className="px-2 py-1.5">
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-xs tabular-nums ${
                      r.movement > 0 ? "text-foreground font-semibold" : "text-muted-foreground"
                    }`}
                    title={
                      r.movement > 0
                        ? `Risk considers this branch ${r.movement} rank${r.movement === 1 ? "" : "s"} more urgent than PCI alone would`
                        : r.movement < 0
                          ? `Risk considers this branch ${Math.abs(r.movement)} rank${Math.abs(r.movement) === 1 ? "" : "s"} less urgent than PCI alone would`
                          : "Same rank under both orderings"
                    }
                  >
                    {r.movement > 0 ? (
                      <TrendingUp size={12} />
                    ) : r.movement < 0 ? (
                      <TrendingDown size={12} />
                    ) : (
                      <Minus size={12} />
                    )}
                    {r.movement > 0 ? `+${r.movement}` : r.movement}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-1.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                  {r.riskScore.toFixed(1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FkVsIcaoTable({
  results,
  roleByBranch,
  onSelectCell,
}: {
  results: BranchRiskResult[];
  roleByBranch: Record<string, BranchRole>;
  onSelectCell: (cell: string | null) => void;
}) {
  const disagreements = useMemo(() => {
    return findDegreeZoneDisagreements(results)
      .slice()
      .sort((a, b) => b.consequence - a.consequence || b.frequency - a.frequency);
  }, [results]);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-card border-b border-border px-4 py-3">
        <h3 className="panel-label">Fine-Kinney degree vs ICAO zone</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Branches where a high Fine-Kinney degree (4-5) and the ICAO Intolerable zone disagree - sorted by
          consequence, then frequency, so any concentration on high-consequence, high-exposure assets is visible
          directly. Click a row to filter it in the register above.
        </p>
      </div>
      {disagreements.length === 0 ? (
        <p className="text-xs text-muted-foreground px-4 py-6 text-center">
          No disagreements in the current network - every branch reaching Fine-Kinney degree 4 or 5 also falls in
          the ICAO Intolerable zone, and no branch is Intolerable without also reaching degree 4 or 5.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-2">Branch</TableHead>
                <TableHead className="px-2">Role</TableHead>
                <TableHead className="px-2" title="Fine-Kinney degree - literature comparison, not a verdict">
                  FK
                </TableHead>
                <TableHead className="px-2" title="ICAO Doc 9859 tolerability - the operational verdict">
                  ICAO Zone
                </TableHead>
                <TableHead className="px-2" title="Worst credible consequence">
                  C
                </TableHead>
                <TableHead className="px-2" title="Exposure frequency">
                  F
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disagreements.map((r) => (
                <TableRow
                  key={r.branchId}
                  onClick={() => onSelectCell(r.icao.cell)}
                  className="cursor-pointer hover:bg-secondary/50 transition-colors"
                >
                  <TableCell className="px-2 py-1.5 font-medium font-mono text-xs text-foreground whitespace-nowrap">
                    {r.branchName}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                    {ROLE_LABELS[roleByBranch[r.branchId]] ?? "Unknown"}
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <span
                      className="pci-swatch inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold font-mono"
                      style={{ backgroundColor: r.band.color, color: "#fff" }}
                    >
                      {r.band.degree}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <span
                      className="pci-swatch inline-flex items-center gap-1.5 px-2 h-6 rounded text-[11px] font-bold font-mono whitespace-nowrap"
                      style={{ backgroundColor: r.icao.zoneColor, color: "#fff" }}
                    >
                      {r.icao.cell}
                      <span className="font-sans font-normal opacity-90">{r.icao.zone}</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-foreground">
                    {r.consequence}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 font-mono text-xs tabular-nums text-foreground">
                    {r.frequency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ComparisonViews({ inputs, results, roleByBranch, onSelectCell }: ComparisonViewsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-condensed text-base font-semibold tracking-tight text-foreground">
          Comparison views
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          The results chapter: how risk-based prioritisation differs from PCI alone, and where the two risk
          methods themselves disagree.
        </p>
      </div>
      <PciVsRiskTable inputs={inputs} />
      <FkVsIcaoTable results={results} roleByBranch={roleByBranch} onSelectCell={onSelectCell} />
    </div>
  );
}
