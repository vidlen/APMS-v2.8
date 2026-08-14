/**
 * dominant-distress.ts
 * -----------------------------------------------------------------------------
 * Picks one dominant distress for a branch from a bag of per-distress totals.
 *
 * Shared by both evidence sources deliberately, because they disagree about
 * what "dominant" means and the disagreement should be visible in one place:
 *
 *   sample units  rank by total ASTM D5340 deduct (a PCI survey computes one)
 *   repair log    rank by DOMINANT_DISTRESS_METRIC - count, area, or
 *                 severity x area (a repair log has no deduct value)
 *
 * risk-adapter.ts resolves which source wins (DISTRESS_SOURCE_ORDER); this
 * module only answers "given these totals, which distress leads, and by how
 * much". Pure, no React, no fetch.
 *
 * NOTE ON IMPORT EXTENSIONS
 *   Relative imports use an explicit `.ts` extension so `node --test` can
 *   resolve this module directly. See the note in risk.ts - don't clean them
 *   away, it breaks `npm test`.
 * -----------------------------------------------------------------------------
 */

import { DISTRESS_ALIASES, SEVERITY_WEIGHT } from '../config/riskScales.ts';

/** The ranking metrics. 'deduct' is the sample-unit path; the other three are
 *  the repair-log path and are what DOMINANT_DISTRESS_METRIC chooses between. */
export type DistressMetric = 'count' | 'area' | 'severity_area' | 'deduct';

/** Running totals for one canonical distress on one branch. */
export interface DistressTally {
  /** Canonical PAVER/ASTM key, e.g. 'ALLIGATOR CR'. */
  distress: string;
  /** Number of records naming this distress. */
  count: number;
  /** Total affected area, m². */
  area: number;
  /** Total area x severity weight. Zero-weighted where severity is missing. */
  severityArea: number;
  /** Total ASTM D5340 deduct. Populated by the sample-unit path only. */
  deduct: number;
}

const METRIC_VALUE: Record<DistressMetric, (t: DistressTally) => number> = {
  count: (t) => t.count,
  area: (t) => t.area,
  severity_area: (t) => t.severityArea,
  deduct: (t) => t.deduct,
};

/** Human-readable metric name for the audit trace and the register. */
export const METRIC_LABELS: Record<DistressMetric, string> = {
  count: 'record count',
  area: 'affected area',
  severity_area: 'severity x area',
  deduct: 'total deduct',
};

/**
 * Canonical key for a distress string, from either source.
 *
 * Trim + uppercase, then the alias table. The alias table carries the repair
 * log's bilingual spellings AND the PCI sample units' own spellings, so both
 * paths land on the same key and a branch covered by both can actually be
 * compared. An unrecognised string passes through uppercased rather than
 * being dropped, so it reaches DISTRESS_TO_HAZARD_CLASS and falls to 'other'
 * there - one place decides that, not two.
 */
export function canonicalDistress(distress: string): string {
  const key = distress.trim().toUpperCase();
  return DISTRESS_ALIASES[key] ?? key;
}

/** Severity weight for a Tingkat Kerusakan value. Unknown or blank scores 0 -
 *  see the note on SEVERITY_WEIGHT for why that beats defaulting to RINGAN. */
export function severityWeight(severity?: string): number {
  if (!severity) return 0;
  return SEVERITY_WEIGHT[severity.trim().toUpperCase()] ?? 0;
}

/**
 * Accumulates one observation into a tally map keyed by canonical distress.
 * `area` and `deduct` default to 0 so the log path can ignore deduct and the
 * sample-unit path can ignore area without either carrying a fake number.
 */
export function addObservation(
  tallies: Map<string, DistressTally>,
  distress: string,
  observation: { area?: number; deduct?: number; severity?: string },
): void {
  const key = canonicalDistress(distress);
  let tally = tallies.get(key);
  if (!tally) {
    tally = { distress: key, count: 0, area: 0, severityArea: 0, deduct: 0 };
    tallies.set(key, tally);
  }
  const area = observation.area ?? 0;
  tally.count += 1;
  tally.area += area;
  tally.severityArea += area * severityWeight(observation.severity);
  tally.deduct += observation.deduct ?? 0;
}

/**
 * Tallies ordered by the metric, highest first.
 *
 * TIE-BREAKING IS A MODELLING DECISION HERE, NOT HOUSEKEEPING.
 *
 * On the committed log, `count` has a TIED top rank on 5 of the 31 covered
 * branches - EC1, N4M, N6, N7 and NC2 - because a branch with a handful of
 * records easily has two distresses recorded the same number of times. On
 * those branches "the distress with the highest count" is simply not defined
 * by the data, and whichever one is reported is an artefact of the ordering.
 * `area` and `severity_area` never tie on the committed log, so this only
 * bites the comparison metrics, never DOMINANT_DISTRESS_METRIC itself.
 *
 * So ties fall back to severityArea: when the primary metric cannot separate
 * two distresses, defer to the metric the system is actually calibrated on
 * rather than to alphabetical order. Count and then name follow, so the
 * ordering is still total and the same input always names the same winner -
 * without that, a tied branch could change hazard class between runs on
 * nothing more than object key order.
 */
export function rankDistresses(
  tallies: Iterable<DistressTally>,
  metric: DistressMetric,
): DistressTally[] {
  const value = METRIC_VALUE[metric];
  return [...tallies].sort(
    (a, b) =>
      value(b) - value(a) ||
      b.severityArea - a.severityArea ||
      b.count - a.count ||
      a.distress.localeCompare(b.distress),
  );
}

/**
 * True when two or more distresses share the top rank under `metric` on the
 * raw value alone, i.e. rankDistresses had to fall back to a tie-break.
 *
 * Exposed so the register can mark a reported "dominant by count" that the
 * data does not actually single out, and so the disagreement statistic in the
 * tests can separate real disagreement from tie-break noise.
 */
export function hasTiedTopRank(
  tallies: Iterable<DistressTally>,
  metric: DistressMetric,
): boolean {
  const value = METRIC_VALUE[metric];
  const values = [...tallies].map(value).sort((a, b) => b - a);
  return values.length > 1 && values[0] === values[1];
}

/** The single dominant distress under `metric`, or undefined for an empty bag. */
export function dominantDistress(
  tallies: Iterable<DistressTally>,
  metric: DistressMetric,
): DistressTally | undefined {
  return rankDistresses(tallies, metric)[0];
}

/** The metric's own value on a tally - what the branch detail panel prints
 *  beside each of the top three. */
export function metricValue(tally: DistressTally, metric: DistressMetric): number {
  return METRIC_VALUE[metric](tally);
}
