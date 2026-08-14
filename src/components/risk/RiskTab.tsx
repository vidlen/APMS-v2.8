import { useMemo, useState } from "react";
import type { SectionData } from "@/lib/pci-utils";
import { pciCategories } from "@/lib/pci-utils";
import type { SurveyYear } from "@/lib/survey-years";
import { useData } from "@/lib/data-store";
import type { SectionRiskMetaOverride } from "@/lib/data-overrides";
import { toBranchRiskInputs } from "@/lib/risk-adapter";
import { scoreNetwork, riskProfile, type BranchRiskResult } from "@/lib/risk";
import { ICAO_ZONES, ICAO_GRID_PROVENANCE, type IcaoZoneName } from "@/config/icaoMatrix";
import { RISK_BANDS, type BranchRole } from "@/config/riskScales";
import MapView, { type MapColorMode } from "@/components/MapView";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import RiskRegisterTable from "./RiskRegisterTable";
import IcaoMatrixPanel from "./IcaoMatrixPanel";
import ComparisonViews from "./ComparisonViews";

interface RiskTabProps {
  sections: SectionData[];
  selectedYear: SurveyYear;
}

const ZONE_ORDER: IcaoZoneName[] = ["Intolerable", "Tolerable", "Acceptable"];

// Stable reference for years with no admin-entered risk overrides, so
// `?? EMPTY_META` doesn't hand toBranchRiskInputs a fresh object identity on
// every render and force it to recompute all 75 scores needlessly.
const EMPTY_META: Record<string, SectionRiskMetaOverride> = {};

// MapView is shared with the PCI tab (backlog F: "reuse the existing GeoJSON
// component"), whose props include a PCI-band legend filter and a
// sample-unit drill-down that have no equivalent in a risk ramp. Stable
// empty/no-op values so those props are inert here without MapView needing
// a second, Risk-specific prop contract.
const EMPTY_BANDS = new Set<string>();
function noop() {}

function RiskMapLegend({ colorMode }: { colorMode: MapColorMode }) {
  if (colorMode === "pci") {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {pciCategories.map((c) => (
          <span key={c.label} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="pci-swatch w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
    );
  }
  if (colorMode === "fk") {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {RISK_BANDS.map((b) => (
          <span key={b.degree} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="pci-swatch w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
            Degree {b.degree}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {ZONE_ORDER.map((zone) => (
        <span key={zone} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <span
            className="pci-swatch w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: ICAO_ZONES[zone].color }}
          />
          {zone}
        </span>
      ))}
    </div>
  );
}

export default function RiskTab({ sections, selectedYear }: RiskTabProps) {
  const { overrides } = useData();
  const riskMetaOverrides = overrides.sectionRiskMeta[selectedYear] ?? EMPTY_META;

  const [colorMode, setColorMode] = useState<MapColorMode>("icao");
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<SectionData | null>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  // Same 75 branches the PCI tab already shows, scored through the
  // Fine-Kinney engine + ICAO crosswalk (src/lib/risk.ts, src/lib/icao.ts),
  // with any admin-entered Risk Inventory overrides (Admin tab) preferred
  // over the heuristic defaults in risk-adapter.ts.
  const inputs = useMemo(
    () => toBranchRiskInputs(sections, selectedYear, riskMetaOverrides),
    [sections, selectedYear, riskMetaOverrides],
  );
  const results = useMemo(() => scoreNetwork(inputs), [inputs]);
  const roleByBranch = useMemo(() => {
    const map: Record<string, BranchRole> = {};
    for (const i of inputs) map[i.branchId] = i.role;
    return map;
  }, [inputs]);
  const riskByBranch = useMemo(() => {
    const map: Record<string, BranchRiskResult> = {};
    for (const r of results) map[r.branchId] = r;
    return map;
  }, [results]);

  const zoneCounts = useMemo(() => {
    const counts: Record<IcaoZoneName, number> = { Intolerable: 0, Tolerable: 0, Acceptable: 0 };
    for (const r of results) counts[r.icao.zone] += 1;
    return counts;
  }, [results]);

  const degreeCounts = useMemo(() => riskProfile(results), [results]);

  // Three filter mechanisms (free-text search, a map click, a matrix cell)
  // stay mutually exclusive rather than silently AND-ing together: picking
  // one clears the others, so what's showing in the register always matches
  // the filter the reader just used.

  // Clicking a branch on the map narrows the register to it and mirrors the
  // PCI tab's selection highlight (white stroke) on the clicked polygon.
  const handleMapFeatureClick = (section: SectionData | null) => {
    setSelectedSection(section);
    if (section) {
      setQuery(section.Section);
      setSelectedCell(null);
    }
  };

  // Clicking a matrix cell (backlog H) filters the register to every branch
  // in that cell - a broader filter than a single branch, so it supersedes
  // both the free-text search and the map's single-branch selection.
  const handleSelectCell = (cell: string | null) => {
    setSelectedCell(cell);
    setQuery("");
    setSelectedSection(null);
  };

  if (results.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center px-6">
        <p className="text-muted-foreground text-sm text-center max-w-sm">
          No branches scored for {selectedYear} - the PCI survey for this year hasn't been loaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      <div>
        <h2 className="font-condensed text-xl font-semibold tracking-tight text-foreground">
          Risk Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-[70ch]">
          Calculated using the Fine-Kinney method and ICAO Doc 9859.
        </p>
        <p className="text-xs text-muted-foreground/80 italic mt-1 max-w-[70ch]">
          Calculated only using processes found in literature, not yet adhering to Angkasa Pura's SMS.
          Still subject to change.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
        {ICAO_GRID_PROVENANCE}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border border border-border rounded-lg overflow-hidden">
        <div className="p-5">
          <div className="flex divide-x divide-border">
            {ZONE_ORDER.map((zone) => (
              <div key={zone} className="flex-1 flex flex-col items-center gap-1 px-2 first:pl-0 last:pr-0">
                <div
                  className="font-mono text-2xl font-bold tabular-nums leading-tight"
                  style={{ color: ICAO_ZONES[zone].color }}
                >
                  {zoneCounts[zone]}
                </div>
                <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">{zone}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t md:border-t-0 border-border">
          <div className="flex divide-x divide-border">
            {RISK_BANDS.map((band) => (
              <div key={band.degree} className="flex-1 flex flex-col items-center gap-1 px-2 first:pl-0 last:pr-0">
                <div
                  className="font-mono text-2xl font-bold tabular-nums leading-tight"
                  style={{ color: band.color }}
                >
                  {degreeCounts[band.degree]}
                </div>
                <div className="text-[9px] tracking-[.07em] uppercase text-muted-foreground">
                  Deg {band.degree}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <IcaoMatrixPanel results={results} selectedCell={selectedCell} onSelectCell={handleSelectCell} />

      {/* Map (backlog F): the same GeoJSON component the PCI tab uses, with
          an ICAO-zone ramp by default and Fine-Kinney/PCI behind a toggle. */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-card border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={colorMode}
            onValueChange={(value) => {
              if (value) setColorMode(value as MapColorMode);
            }}
          >
            <ToggleGroupItem value="icao">ICAO Zone</ToggleGroupItem>
            <ToggleGroupItem value="fk">Fine-Kinney</ToggleGroupItem>
            <ToggleGroupItem value="pci">PCI</ToggleGroupItem>
          </ToggleGroup>
          <RiskMapLegend colorMode={colorMode} />
        </div>
        <div className="relative h-[480px]">
          <MapView
            selectedYear={selectedYear}
            onFeatureClick={handleMapFeatureClick}
            selectedSection={selectedSection}
            detailedSection={null}
            onExitDetails={noop}
            activeBands={EMPTY_BANDS}
            onClearBands={noop}
            colorMode={colorMode}
            riskByBranch={riskByBranch}
          />
        </div>
      </div>

      <RiskRegisterTable
        results={results}
        roleByBranch={roleByBranch}
        query={query}
        onQueryChange={setQuery}
        cellFilter={selectedCell}
        onClearCellFilter={() => setSelectedCell(null)}
      />

      <ComparisonViews
        inputs={inputs}
        results={results}
        roleByBranch={roleByBranch}
        onSelectCell={handleSelectCell}
      />
    </div>
  );
}
