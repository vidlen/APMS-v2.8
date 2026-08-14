import { toast } from "sonner";
import { usePavementData } from "@/hooks/usePavementData";
import { useData } from "@/lib/data-store";
import { inferredRoleFor, inferredDominantDistressFor, toBranchRiskInputs } from "@/lib/risk-adapter";
import { hazardClassFor, scoreBranch } from "@/lib/risk";
import LfcOverrideDialog from "./LfcOverrideDialog";
import {
  ROLE_LABELS,
  DISTRESS_TO_HAZARD_CLASS,
  HAZARD_CLASS_DETECTABILITY,
  DETECTABILITY_LABELS,
  DETECTABILITY_ESCALATION,
  type BranchRole,
  type Detectability,
} from "@/config/riskScales";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RotateCcw } from "lucide-react";

interface RiskInventoryTableProps {
  year: string;
}

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [BranchRole, string][];
const DISTRESS_OPTIONS = Object.keys(DISTRESS_TO_HAZARD_CLASS);
const DETECTABILITY_OPTIONS = Object.keys(DETECTABILITY_LABELS) as Detectability[];
// Radix Select items can't take an empty-string value, so "no override" gets
// its own sentinel and is translated back to `undefined` in the handler.
const NONE_DISTRESS = "__none__";
const INFERRED_DETECTABILITY = "__inferred__";

export default function RiskInventoryTable({ year }: RiskInventoryTableProps) {
  const { sections, loading } = usePavementData(year);
  const { overrides, setSectionRiskMeta } = useData();
  const overridesForYear = overrides.sectionRiskMeta[year] ?? {};

  const parsedYear = Number.parseInt(year, 10);
  const defaultInspectionYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();

  if (loading) {
    return <p className="text-muted-foreground text-sm px-4 py-6">Loading…</p>;
  }

  if (sections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm px-4 py-6">
        No data for {year} yet — import a GeoJSON or clone another year from Survey Years first.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Section</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Last inspection year</TableHead>
          <TableHead>Dominant distress</TableHead>
          <TableHead title="Locked decision 6 — a label always shows; it only escalates likelihood when explicitly set here">
            Detectability
          </TableHead>
          <TableHead title="Backlog L — replaces the computed L, F, or C outright">L / F / C</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((s) => {
          const override = overridesForYear[s.Section] ?? {};
          const inferredRole = inferredRoleFor(s.Section);
          const inferredDistress = inferredDominantDistressFor(s.Section);
          // Scoped to the inventory fields the reset button actually clears -
          // lfcOverride has its own clear action inside its dialog, so it
          // shouldn't make this button appear for a row that's otherwise
          // fully at its inferred defaults.
          const hasInventoryOverride = Object.keys(override).some((k) => k !== "lfcOverride");
          const hazardClass = hazardClassFor(override.dominantDistress);
          const inferredDetectability = HAZARD_CLASS_DETECTABILITY[hazardClass];
          // The engine's own value, ignoring lfcOverride - what the dialog
          // shows beside each override field (backlog L).
          const computedInput = toBranchRiskInputs([s], year, {
            [s.Section]: { ...override, lfcOverride: undefined },
          })[0];
          const computed = scoreBranch(computedInput);

          return (
            <TableRow key={s.Section}>
              <TableCell className="font-medium text-foreground whitespace-nowrap">
                {s.Section}
              </TableCell>
              <TableCell>
                <Select
                  value={override.role ?? inferredRole}
                  onValueChange={(value) =>
                    setSectionRiskMeta(year, s.Section, { role: value as BranchRole })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(([role, label]) => (
                      <SelectItem key={role} value={role}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  key={`${year}-${s.Section}-${override.lastInspectionYear ?? defaultInspectionYear}`}
                  defaultValue={override.lastInspectionYear ?? defaultInspectionYear}
                  className="h-8 w-24 tabular-nums"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) return;
                    const num = Number(raw);
                    if (!Number.isFinite(num)) {
                      toast.error("Last inspection year must be a number");
                      return;
                    }
                    setSectionRiskMeta(year, s.Section, { lastInspectionYear: num });
                  }}
                />
              </TableCell>
              <TableCell>
                <Select
                  value={override.dominantDistress ?? inferredDistress ?? NONE_DISTRESS}
                  onValueChange={(value) =>
                    setSectionRiskMeta(year, s.Section, {
                      dominantDistress: value === NONE_DISTRESS ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_DISTRESS}>— none recorded —</SelectItem>
                    {DISTRESS_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={override.detectability ?? INFERRED_DETECTABILITY}
                  onValueChange={(value) =>
                    setSectionRiskMeta(year, s.Section, {
                      detectability:
                        value === INFERRED_DETECTABILITY ? undefined : (value as Detectability),
                    })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INFERRED_DETECTABILITY}>
                      {DETECTABILITY_LABELS[inferredDetectability]}
                    </SelectItem>
                    {DETECTABILITY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DETECTABILITY_LABELS[d]}
                        {DETECTABILITY_ESCALATION[d] > 0 ? ` (+${DETECTABILITY_ESCALATION[d]} step)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <LfcOverrideDialog
                  branchName={s.Section}
                  computed={{
                    likelihood: computed.likelihood,
                    frequency: computed.frequency,
                    consequence: computed.consequence,
                  }}
                  current={override.lfcOverride}
                  onSave={(lfcOverride) => setSectionRiskMeta(year, s.Section, { lfcOverride })}
                  onClear={() => setSectionRiskMeta(year, s.Section, { lfcOverride: undefined })}
                />
              </TableCell>
              <TableCell>
                {hasInventoryOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Clear overrides for this branch — revert to inferred defaults"
                    onClick={() =>
                      setSectionRiskMeta(year, s.Section, {
                        role: undefined,
                        lastInspectionYear: undefined,
                        dominantDistress: undefined,
                        detectability: undefined,
                      })
                    }
                  >
                    <RotateCcw size={13} />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
