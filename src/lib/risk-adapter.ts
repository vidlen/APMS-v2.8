/**
 * risk-adapter.ts
 * -----------------------------------------------------------------------------
 * Bridges the app's existing SectionData (the PCI tab's data model) into the
 * risk engine's BranchRiskInput, so the Risk tab can score the same 75
 * branches the PCI map already shows, with no separate dataset to maintain.
 *
 * The dummy GeoJSON does not yet carry `role` or `lastInspectionYear` per
 * branch (brief backlog item B - a real inventory task, not something
 * inferable from what's already committed). Until that lands, this file
 * supplies defensible stand-ins:
 *
 *  - lastInspectionYear: the survey year already being viewed. This is not a
 *    guess - the branch's PCI figure itself comes from that year's survey.
 *  - role: backlog item B's upgrade path, realized for all 75 branches via
 *    KNOWN_ROLES - a real per-branch classification transcribed from the
 *    reviewed Risk Inventory_Admin.xlsx (2026-08-10), keyed by exact Section
 *    code. roleFromSectionName's name-based heuristic remains only as the
 *    fallback for a branch this table doesn't cover (a future survey year
 *    adding a new code before the inventory is updated for it).
 *
 * DOMINANT DISTRESS - PRECEDENCE (v2.8 brief section 5)
 *   The known-role table above has no equivalent for dominantDistress
 *   anymore. v2.7 shipped a two-row reviewed table (KNOWN_DOMINANT_DISTRESS)
 *   covering 06/24 and 07L/25R only; 73 of 75 branches scored hazard class
 *   'other' for lack of any evidence. resolveDominantDistress below replaces
 *   that with an ordered chain, first hit wins (DISTRESS_SOURCE_ORDER,
 *   riskScales.ts):
 *
 *     1. admin      an explicit per-branch override (Admin -> Risk Inventory)
 *     2. units      PCI sample units, aggregated by total ASTM D5340 deduct
 *     3. log        the repair log, aggregated by DOMINANT_DISTRESS_METRIC
 *     4. inventory  KNOWN_DOMINANT_DISTRESS, the original two-row table
 *     5. none       no evidence - hazardClass falls back to 'other'
 *
 *   Sample units outrank the log because a PCI survey is a systematic census
 *   of the pavement, while the log is an event record: distress nobody found,
 *   or found and did not fix, never appears in it. See riskScales.ts section 8
 *   for the full reasoning and the sourcing of each table.
 *
 * toBranchRiskInputs' third argument is the layer above even the known-role
 * table: an admin-entered override per branch (Admin -> Risk Inventory,
 * persisted via setSectionRiskMeta - localStorage demo overrides, same
 * status as PCI edits, never the committed calibration itself). Any field
 * left unset there still falls back to the stand-ins documented above.
 *
 * The fourth argument is backlog M: Teammate A's Tier 1 Markov forecast
 * (Admin -> Tier 1 Forecast, brief section 11). scoreBranch has resolved
 * Tier 1 ahead of Tier 2/3 since the original draft - a branch with a
 * matching entry here scores on it automatically; every branch without one
 * keeps scoring on Tier 3 exactly as before. Nothing about this module ever
 * blocked on Teammate A's delivery; this argument is simply where it plugs
 * in once it exists.
 *
 * The fifth and sixth arguments are the two new evidence sources: the PCI
 * sample units already loaded for the survey year (unitsBySection - the app
 * has carried this since usePavementData, but risk-adapter never consumed
 * it), and the repair log's per-branch distress tallies (repairLogByBranch -
 * the output of aggregateRepairLog in repair-log.ts, computed once by the
 * caller rather than re-aggregated per branch here).
 * -----------------------------------------------------------------------------
 */

// .ts extensions below are required so `node --test` can resolve this module
// directly (see the note in risk.ts) - Vite and tsc both resolve it fine.
import type { SectionData } from './pci-utils.ts';
import { parsePCIValue } from './pci-utils.ts';
import type { SurveyYear } from './survey-years.ts';
import type { BranchRiskInput } from './risk.ts';
import { DOMINANT_DISTRESS_METRIC, type BranchRole, type DistressSource } from '../config/riskScales.ts';
import type { SectionRiskMetaOverride } from './data-overrides.ts';
import type { MarkovForecastEntry } from './markov-forecast.ts';
import type { GeoJSONFeatureCollection } from './geojson-types.ts';
import type { SampleUnitProperties } from './sample-units.ts';
import { addObservation, dominantDistress, type DistressTally } from './dominant-distress.ts';

// SHIA's own runway designators ("06/24", "07L/25R"). Matches exactly two of
// the 75 codes.
const RUNWAY_PATTERN = /^\d{2}[LCR]?\/\d{2}[LCR]?$/;

// NP1-NP3 / SP1-SP2: the full-length parallel taxiways, distinguishable from
// every other taxiway code by their dimension (3100-3760 m, matching runway
// length) as well as the NP/SP prefix.
const PARALLEL_TAXIWAY_PATTERN = /^(NP|SP)\d/;

export function roleFromSectionName(section: string): BranchRole {
  const name = section.trim();
  if (RUNWAY_PATTERN.test(name)) return 'runway';
  if (name.startsWith('Remote Apron')) return 'remote_apron';
  if (name.startsWith('Apron')) return 'active_apron';
  if (PARALLEL_TAXIWAY_PATTERN.test(name)) return 'parallel_taxiway';
  // Every remaining code (N#, NC#, S#, SC#, M#, WC#, EC#, NCY, NPW, SPW,
  // NPE, SPE, ...) is a shorter connector/exit taxiway - see the ceiling note
  // in the file header. This is the fallback, not an inference.
  return 'secondary_taxiway';
}

// Reviewed per-branch role classification, transcribed verbatim from
// Risk Inventory_Admin.xlsx (2026-08-10) - covers all 75 branches in the
// current network. Not derivable from the Section code alone: several bare
// N#/S#/M# codes are high-speed exit taxiways that the naming heuristic
// above can't distinguish from an ordinary connector (see its own ceiling
// note), and S8 is the one bare S# code that is NOT a high-speed exit,
// confirming this is a real reviewed assignment rather than a smarter regex.
const KNOWN_ROLES: Partial<Record<string, BranchRole>> = {
  '07R/25L': 'runway',
  'SP1': 'parallel_taxiway',
  'SP2': 'parallel_taxiway',
  'M1': 'high_speed_exit',
  'M2': 'high_speed_exit',
  'M7': 'high_speed_exit',
  'M8': 'high_speed_exit',
  'N1': 'high_speed_exit',
  'N2': 'high_speed_exit',
  'N3': 'high_speed_exit',
  'N3M': 'secondary_taxiway',
  'N4': 'high_speed_exit',
  'N4M': 'secondary_taxiway',
  'N5': 'high_speed_exit',
  'N6': 'high_speed_exit',
  'N6M': 'secondary_taxiway',
  'N7': 'high_speed_exit',
  'N7M': 'secondary_taxiway',
  'N8': 'high_speed_exit',
  'N8M': 'secondary_taxiway',
  'N9': 'high_speed_exit',
  'NC1': 'secondary_taxiway',
  'NC2': 'secondary_taxiway',
  'NC3': 'secondary_taxiway',
  'NC4': 'secondary_taxiway',
  'NC5': 'secondary_taxiway',
  'NC6': 'secondary_taxiway',
  'NC7': 'secondary_taxiway',
  'NC9': 'secondary_taxiway',
  'NCY': 'secondary_taxiway',
  'NP1': 'parallel_taxiway',
  'NP2': 'parallel_taxiway',
  'NP3': 'parallel_taxiway',
  'NPE': 'secondary_taxiway',
  'NPW': 'secondary_taxiway',
  '06/24': 'runway',
  '07L/25R': 'runway',
  'S1': 'high_speed_exit',
  'S2': 'high_speed_exit',
  'S3': 'high_speed_exit',
  'S4': 'high_speed_exit',
  'S5': 'high_speed_exit',
  'S6': 'high_speed_exit',
  'S7': 'high_speed_exit',
  'S8': 'secondary_taxiway',
  'S9': 'high_speed_exit',
  'SC1': 'secondary_taxiway',
  'SC2': 'secondary_taxiway',
  'SC3': 'secondary_taxiway',
  'SC4': 'secondary_taxiway',
  'SC5': 'secondary_taxiway',
  'SC6': 'secondary_taxiway',
  'SC8': 'secondary_taxiway',
  'SC9': 'secondary_taxiway',
  'SCX': 'secondary_taxiway',
  'SPE': 'secondary_taxiway',
  'SPW': 'secondary_taxiway',
  'WC1': 'secondary_taxiway',
  'WC2': 'secondary_taxiway',
  'EC1': 'secondary_taxiway',
  'EC2': 'secondary_taxiway',
  'Apron A': 'active_apron',
  'Apron B': 'active_apron',
  'Apron C': 'active_apron',
  'Apron D': 'active_apron',
  'Apron E': 'active_apron',
  'Apron F': 'active_apron',
  'Apron G': 'active_apron',
  'Apron H': 'active_apron',
  'Apron I': 'active_apron',
  'Apron J': 'active_apron',
  'Apron K': 'active_apron',
  'Remote Apron B': 'remote_apron',
  'Remote Apron C': 'remote_apron',
  'Remote Apron D': 'remote_apron',
};

// Same source, the 2 of 75 branches with a recorded dominant distress. Kept
// as the lowest-precedence fallback (source 'inventory') behind the sample
// units and the repair log - both branches now resolve via 'units' before
// this table is ever consulted, since PCI sample units exist for both. It
// stays live for whichever branch has neither.
const KNOWN_DOMINANT_DISTRESS: Partial<Record<string, string>> = {
  '06/24': 'RAVELING',
  '07L/25R': 'L & T CR',
};

/** The best available default role: reviewed inventory first, then the naming heuristic. */
export function inferredRoleFor(section: string): BranchRole {
  return KNOWN_ROLES[section.trim()] ?? roleFromSectionName(section);
}

/** The reviewed dominant distress for a branch, if the inventory has one. */
export function inferredDominantDistressFor(section: string): string | undefined {
  return KNOWN_DOMINANT_DISTRESS[section.trim()];
}

/**
 * Tallies a branch's PCI sample units by total ASTM D5340 deduct - the metric
 * a PCI survey actually produces, unlike the repair log which has no deduct
 * value and falls back to DOMINANT_DISTRESS_METRIC instead (dominant-distress.ts
 * documents why the two evidence sources need different metrics).
 */
export function tallyUnitsByDeduct(unitsFc: GeoJSONFeatureCollection): DistressTally[] {
  const tallies = new Map<string, DistressTally>();
  for (const feature of unitsFc.features) {
    const props = feature.properties as unknown as SampleUnitProperties;
    for (const distress of props.distresses ?? []) {
      addObservation(tallies, distress.type, { deduct: distress.deduct });
    }
  }
  return [...tallies.values()];
}

/**
 * Resolves one branch's dominant distress through the precedence chain
 * documented in the file header. Returns the canonical distress key (already
 * ranked by the appropriate metric for its source) plus which source won, so
 * the caller can carry both onto BranchRiskInput.
 */
export function resolveDominantDistress(
  section: string,
  override: SectionRiskMetaOverride | undefined,
  unitsBySection: Record<string, GeoJSONFeatureCollection>,
  repairLogByBranch: Record<string, DistressTally[]>,
): { distress?: string; source: DistressSource } {
  if (override?.dominantDistress) {
    return { distress: override.dominantDistress, source: 'admin' };
  }

  const unitsFc = unitsBySection[section];
  if (unitsFc) {
    const winner = dominantDistress(tallyUnitsByDeduct(unitsFc), 'deduct');
    if (winner) return { distress: winner.distress, source: 'units' };
  }

  const logTallies = repairLogByBranch[section];
  if (logTallies && logTallies.length > 0) {
    const winner = dominantDistress(logTallies, DOMINANT_DISTRESS_METRIC);
    if (winner) return { distress: winner.distress, source: 'log' };
  }

  const inventory = inferredDominantDistressFor(section);
  if (inventory) return { distress: inventory, source: 'inventory' };

  return { distress: undefined, source: 'none' };
}

export function toBranchRiskInputs(
  sections: SectionData[],
  year: SurveyYear,
  overridesByBranch: Record<string, SectionRiskMetaOverride> = {},
  markovByBranch: Record<string, MarkovForecastEntry> = {},
  unitsBySection: Record<string, GeoJSONFeatureCollection> = {},
  repairLogByBranch: Record<string, DistressTally[]> = {},
): BranchRiskInput[] {
  const parsedYear = Number.parseInt(year, 10);
  const defaultInspectionYear = Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();

  return sections.map((s) => {
    const override = overridesByBranch[s.Section];
    const { distress, source } = resolveDominantDistress(
      s.Section,
      override,
      unitsBySection,
      repairLogByBranch,
    );
    return {
      branchId: s.Section,
      branchName: s.Section,
      role: override?.role ?? inferredRoleFor(s.Section),
      currentPci: parsePCIValue(s['PCI Rating']),
      lastInspectionYear: override?.lastInspectionYear ?? defaultInspectionYear,
      dominantDistress: distress,
      distressSource: source,
      detectability: override?.detectability,
      // LfcOverride mirrors BranchRiskInput['overrides'] field for field
      // (backlog L) - passed straight through, applied last in scoreBranch.
      overrides: override?.lfcOverride,
      // Backlog M - present only for a branch Teammate A's forecast covers.
      markovTriggerProbability: markovByBranch[s.Section]?.markovTriggerProbability,
    };
  });
}
