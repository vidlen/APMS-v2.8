import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { Download, Upload, RotateCcw } from "lucide-react";
import { usePavementData } from "@/hooks/usePavementData";
import { useData, useRepairLog } from "@/lib/data-store";
import { aggregateRepairLog, parseRepairLogFile, type UnresolvedRecord } from "@/lib/repair-log";
import { downloadJson } from "@/lib/geojson-io";
import { Button } from "@/components/ui/button";

interface RepairLogPanelProps {
  year: string;
}

const REASON_LABELS: Record<UnresolvedRecord["reason"], string> = {
  unresolved_group: "Group label, no branch code found in the location text",
  unknown_facility: "Facility is not a Section code and not a group",
};

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-base font-bold tabular-nums text-foreground leading-tight">
        {value}
      </span>
      <span className="text-[10px] tracking-[.05em] uppercase text-muted-foreground leading-tight">
        {label}
      </span>
    </div>
  );
}

// Admin -> Repair Log (brief section 8.6): accepts the converted JSON,
// reports how many records resolved by facility, by location, and not at
// all, and lists the unresolved ones. Not year-scoped in storage (the log
// spans one continuous 7-month window, see DataOverrides.repairLog), but the
// resolution stats below ARE computed against `year`'s branch set, since
// that's what decides which location matches are accepted.
export default function RepairLogPanel({ year }: RepairLogPanelProps) {
  const { importRepairLogJSON, resetRepairLogToSeed, overrides } = useData();
  const { records, loading } = useRepairLog();
  const { sections } = usePavementData(year);
  const fileInput = useRef<HTMLInputElement>(null);

  const aggregate = useMemo(() => {
    const knownBranches = new Set(sections.map((s) => s.Section));
    return aggregateRepairLog(records, knownBranches);
  }, [sections, records]);

  const hasImportedLog = overrides.repairLog !== undefined;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await parseRepairLogFile(file);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    importRepairLogJSON(result.data);
    toast.success(`Imported ${result.data.length} repair-log records`);
  };

  const handleDownload = () => {
    downloadJson(hasImportedLog ? "repair-log-imported.json" : "repair-log-2025.json", records);
  };

  const handleResetToSeed = () => {
    resetRepairLogToSeed();
    toast.success("Reverted to the seeded repair log");
  };

  return (
    <div className="panel-surface rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Repair Log</h2>
        {hasImportedLog && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase tracking-wide">
            Admin import active
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground max-w-prose">
        Every branch's dominant distress is resolved through admin override, then PCI sample units,
        then this log, then the reviewed inventory table (risk-adapter.ts). Importing a new log here
        replaces the seeded 2025 log for every survey year - it isn't tied to {year} specifically.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          <Upload size={13} />
          Upload repair log JSON
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImport}
        />
        <Button variant="secondary" size="sm" onClick={handleDownload} disabled={loading}>
          <Download size={13} />
          Download current log ({records.length} records)
        </Button>
        {hasImportedLog && (
          <Button variant="ghost" size="sm" onClick={handleResetToSeed}>
            <RotateCcw size={13} />
            Revert to seeded log
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 pt-1">
        <Stat value={aggregate.stats.total} label="Total records" />
        <Stat value={aggregate.stats.byFacility} label="Resolved by facility" />
        <Stat value={aggregate.stats.byLocation} label="Resolved by location" />
        <Stat value={aggregate.stats.unresolvedGroup} label="Unresolved group" />
        <Stat value={aggregate.stats.unknownFacility} label="Unknown facility" />
        <Stat value={aggregate.stats.skippedNoDistress} label="Skipped, no distress type" />
        <Stat value={aggregate.stats.branchesCovered} label={`of ${sections.length} branches covered`} />
      </div>

      {aggregate.unresolved.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="panel-label mb-2">Unresolved records ({aggregate.unresolved.length})</p>
          <ul className="max-h-56 overflow-y-auto divide-y divide-border text-xs">
            {aggregate.unresolved.map((u) => (
              <li
                key={u.index}
                className="py-1.5 flex items-center justify-between gap-3"
                title={`Record ${u.index}`}
              >
                <span className="text-foreground truncate">
                  {u.facility}
                  {u.location && <span className="text-muted-foreground"> — {u.location}</span>}
                </span>
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {REASON_LABELS[u.reason]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
