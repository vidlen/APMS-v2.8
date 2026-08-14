import { useMemo } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { usePavementData } from "@/hooks/usePavementData";
import { useData, useRepairLog } from "@/lib/data-store";
import {
  inferredRoleFor,
  resolveDominantDistress,
  tallyUnitsByDeduct,
  toBranchRiskInputs,
} from "@/lib/risk-adapter";
import { hazardClassFor, scoreBranch } from "@/lib/risk";
import { aggregateRepairLog } from "@/lib/repair-log";
import { dominantDistress, metricValue, type DistressTally } from "@/lib/dominant-distress";
import type { GeoJSONFeatureCollection } from "@/lib/geojson-types";
import LfcOverrideDialog from "./LfcOverrideDialog";
import {
  ROLE_LABELS,
  DISTRESS_TO_HAZARD_CLASS,
  HAZARD_CLASS_DETECTABILITY,
  DETECTABILITY_LABELS,
  DETECTABILITY_ESCALATION,
  DISTRESS_SEVERITY_LABELS,
  SEVERITY_CONSEQUENCE_ESCALATION,
  DOMINANT_DISTRESS_METRIC,
  type BranchRole,
  type Detectability,
  type DistressSeverityLevel,
  type DistressSource,
  type HazardClass,
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
const SEVERITY_OPTIONS = Object.keys(DISTRESS_SEVERITY_LABELS) as DistressSeverityLevel[];
// Radix Select items can't take an empty-string value, so "no override" gets
// its own sentinel and is translated back to `undefined` in the handler.
const NONE_DISTRESS = "__none__";
const INFERRED_DETECTABILITY = "__inferred__";
// No "inferred" sentinel here, unlike detectability - Phase 8 has no
// auto-inferred severity to fall back to display (see the section note on
// SEVERITY_CONSEQUENCE_ESCALATION, riskScales.ts).
const NONE_SEVERITY = "__none__";

// Section 8, riskScales.ts - same short names the register uses, so an admin
// reading both screens sees the same vocabulary for where a distress came from.
const SOURCE_LABELS: Record<DistressSource, string> = {
  admin: "admin override",
  units: "PCI sample units",
  log: "repair log",
  inventory: "reviewed inventory",
  none: "no evidence",
};

// The sentinel item's label when no admin override is set: what the engine
// actually resolved, its source, and (for the repair log) the record count -
// e.g. "PATCHING — repair log, 148 records". Answers the brief's "show the
// resolved distress as the select placeholder" without a second read-only cell.
function resolvedDistressLabel(
  distress: string | undefined,
  source: DistressSource,
  logTallies: ReturnType<typeof aggregateRepairLog>["byBranch"][string] | undefined,
): string {
  if (!distress) return "— none recorded —";
  if (source === "log" && logTallies) {
    const winner = logTallies.find((t) => t.distress === distress);
    if (winner) {
      const count = metricValue(winner, "count");
      return `${distress} — repair log, ${count} record${count === 1 ? "" : "s"}`;
    }
  }
  return `${distress} — ${SOURCE_LABELS[source]}`;
}

/**
 * Whether sample units and the repair log would pick a different hazard
 * class for this branch, independent of which one the precedence chain
 * actually resolved to. Only 06/24 and 07L/25R have both sources today, but
 * this isn't hardcoded to them - any branch that gains both evidence sources
 * later stays covered.
 *
 * Component-local rather than exported from risk-adapter.ts: this is a
 * display concern (should the admin table show a warning icon), built
 * entirely from pieces risk-adapter.ts and dominant-distress.ts already
 * export, not a piece of the scoring pipeline itself.
 */
function distressConflictFor(
  section: string,
  unitsBySection: Record<string, GeoJSONFeatureCollection>,
  repairLogByBranch: Record<string, DistressTally[]>,
): { unitsClass: HazardClass; logClass: HazardClass } | null {
  const unitsFc = unitsBySection[section];
  const logTallies = repairLogByBranch[section];
  if (!unitsFc || !logTallies || logTallies.length === 0) return null;

  const unitsWinner = dominantDistress(tallyUnitsByDeduct(unitsFc), "deduct");
  const logWinner = dominantDistress(logTallies, DOMINANT_DISTRESS_METRIC);
  if (!unitsWinner || !logWinner) return null;

  const unitsClass = hazardClassFor(unitsWinner.distress);
  const logClass = hazardClassFor(logWinner.distress);
  return unitsClass === logClass ? null : { unitsClass, logClass };
}

export default function RiskInventoryTable({ year }: RiskInventoryTableProps) {
  const { sections, unitsBySection, loading } = usePavementData(year);
  const { overrides, setSectionRiskMeta } = useData();
  const overridesForYear = overrides.sectionRiskMeta[year] ?? {};
  const { records: repairLogRecords } = useRepairLog();

  const repairLogByBranch = useMemo(() => {
    const knownBranches = new Set(sections.map((s) => s.Section));
    return aggregateRepairLog(repairLogRecords, knownBranches).byBranch;
  }, [sections, repairLogRecords]);

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
          <TableHead title="Phase 8 (gated) — no inferred default; BERAT escalates consequence one step when explicitly set here">
            Distress severity
          </TableHead>
          <TableHead title="Backlog L — replaces the computed L, F, or C outright">L / F / C</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((s) => {
          const override = overridesForYear[s.Section] ?? {};
          const inferredRole = inferredRoleFor(s.Section);
          // Scoped to the inventory fields the reset button actually clears -
          // lfcOverride has its own clear action inside its dialog, so it
          // shouldn't make this button appear for a row that's otherwise
          // fully at its inferred defaults.
          const hasInventoryOverride = Object.keys(override).some((k) => k !== "lfcOverride");

          // Fixed bug: this used to read hazardClassFor(override.dominantDistress)
          // directly, ignoring every branch whose distress comes from anywhere
          // but an admin override - the resolved value shown in the Distress
          // cell below fed nothing. HAZARD_CLASS_DETECTABILITY[hazardClass] two
          // lines down inherits the fix, so 06/24 and 07L/25R's Detectability
          // label now reads from 'structural', not the 'other' it silently fell
          // back to before.
          const resolved = resolveDominantDistress(s.Section, override, unitsBySection, repairLogByBranch);
          const hazardClass = hazardClassFor(resolved.distress);
          const inferredDetectability = HAZARD_CLASS_DETECTABILITY[hazardClass];

          // Flags 06/24 and 07L/25R (brief section 5: "flag the conflicts") -
          // the only branches with both sample units and log evidence today,
          // but not hardcoded to them: any branch that later gains both stays
          // covered. Only meaningful when there is no admin override, since an
          // override is the resolution.
          const conflict =
            !override.dominantDistress
              ? distressConflictFor(s.Section, unitsBySection, repairLogByBranch)
              : null;

          // The engine's own value, ignoring lfcOverride - what the dialog
          // shows beside each override field (backlog L). Threads the same
          // evidence sources as the register (Phase 3/4) so the "computed"
          // baseline the dialog shows matches what a reader sees there.
          const computedInput = toBranchRiskInputs(
            [s],
            year,
            { [s.Section]: { ...override, lfcOverride: undefined } },
            {},
            unitsBySection,
            repairLogByBranch,
          )[0];
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
                <div className="flex items-center gap-1.5">
                  <Select
                    value={override.dominantDistress ?? NONE_DISTRESS}
                    onValueChange={(value) =>
                      setSectionRiskMeta(year, s.Section, {
                        dominantDistress: value === NONE_DISTRESS ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="h-8 w-full min-w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_DISTRESS}>
                        {resolvedDistressLabel(
                          resolved.distress,
                          resolved.source,
                          repairLogByBranch[s.Section],
                        )}
                      </SelectItem>
                      {DISTRESS_OPTIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {conflict && (
                    <span
                      className="shrink-0 text-amber-600 dark:text-amber-500"
                      title={`Sample units (${conflict.unitsClass}) and the repair log (${conflict.logClass}) disagree on hazard class. Units wins per DISTRESS_SOURCE_ORDER; set an explicit override here to resolve it.`}
                    >
                      <AlertTriangle size={14} />
                    </span>
                  )}
                </div>
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
                <Select
                  value={override.distressSeverity ?? NONE_SEVERITY}
                  onValueChange={(value) =>
                    setSectionRiskMeta(year, s.Section, {
                      distressSeverity:
                        value === NONE_SEVERITY ? undefined : (value as DistressSeverityLevel),
                    })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SEVERITY}>— none set —</SelectItem>
                    {SEVERITY_OPTIONS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {DISTRESS_SEVERITY_LABELS[level]}
                        {SEVERITY_CONSEQUENCE_ESCALATION[level] > 0
                          ? ` (+${SEVERITY_CONSEQUENCE_ESCALATION[level]} step)`
                          : ""}
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
                        distressSeverity: undefined,
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
