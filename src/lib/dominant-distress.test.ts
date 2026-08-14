/**
 * dominant-distress.test.ts
 * -----------------------------------------------------------------------------
 * Test 9 of the v2.8 brief: the three metrics genuinely disagree, and each
 * returns its own answer.
 *
 * This matters because DOMINANT_DISTRESS_METRIC is a stated modelling
 * decision, not a default. On the committed log the three metrics pick a
 * different hazard class on 8 of the 30 branches carrying an asphalt distress.
 * If a refactor quietly collapsed two metrics onto the same answer, the
 * decision would look free when it is not - so the disagreement itself is
 * what gets asserted here.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregateRepairLog, validateRepairLog } from './repair-log.ts';
import {
  addObservation,
  canonicalDistress,
  dominantDistress,
  hasTiedTopRank,
  metricValue,
  rankDistresses,
  severityWeight,
  type DistressTally,
} from './dominant-distress.ts';
import { DISTRESS_TO_HAZARD_CLASS } from '../config/riskScales.ts';

function tally(
  distress: string,
  count: number,
  area: number,
  severityArea: number,
  deduct = 0,
): DistressTally {
  return { distress, count, area, severityArea, deduct };
}

/* --- Test 9: the three metrics each return their own answer -------------- */

test('9. count, area and severity_area each name a different distress', () => {
  // Shaped after branch N1 on the committed log, where all three disagree:
  // PATCHING recurs most, ASPHALT STRIPPING covers the most pavement, and
  // SHOVING wins once severity is folded in.
  const tallies = [
    tally('PATCHING', 9, 4.0, 8.0),
    tally('ASPHALT STRIPPING', 3, 9.0, 9.0),
    tally('SHOVING', 2, 6.0, 18.0),
  ];

  assert.equal(dominantDistress(tallies, 'count')?.distress, 'PATCHING');
  assert.equal(dominantDistress(tallies, 'area')?.distress, 'ASPHALT STRIPPING');
  assert.equal(dominantDistress(tallies, 'severity_area')?.distress, 'SHOVING');
});

test('9b. and the metric choice changes the hazard class that reaches C', () => {
  // The reason the metric is a stated decision rather than an implementation
  // detail: it moves the consequence input, not just a display string.
  const tallies = [
    tally('PATCHING', 9, 4.0, 8.0),
    tally('ASPHALT STRIPPING', 3, 9.0, 9.0),
    tally('SHOVING', 2, 6.0, 18.0),
  ];

  const classFor = (metric: 'count' | 'area' | 'severity_area') =>
    DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, metric)!.distress];

  assert.equal(classFor('count'), 'fod');
  assert.equal(classFor('area'), 'fod');
  assert.equal(classFor('severity_area'), 'friction');
});

test('the sample-unit path ranks the same tallies by deduct', () => {
  const tallies = [
    tally('PATCHING', 9, 4.0, 8.0, 2.5),
    tally('ALLIGATOR CR', 1, 0.5, 1.5, 31.0),
  ];
  assert.equal(dominantDistress(tallies, 'count')?.distress, 'PATCHING');
  assert.equal(dominantDistress(tallies, 'deduct')?.distress, 'ALLIGATOR CR');
});

/* --- Ordering must be total and stable ------------------------------------ */

test('rankDistresses returns every tally, highest metric first', () => {
  const ranked = rankDistresses(
    [tally('A', 1, 1, 1), tally('B', 5, 5, 5), tally('C', 3, 3, 3)],
    'severity_area',
  );
  assert.deepEqual(
    ranked.map((t) => t.distress),
    ['B', 'C', 'A'],
  );
});

test('a count tie defers to severity_area before anything arbitrary', () => {
  // The case that actually occurs on the log: two distresses recorded the same
  // number of times. Alphabetical order would hand the branch to 'AAA' on
  // spelling alone; the calibrated metric hands it to the heavier distress.
  const tied = [tally('AAA', 2, 1, 2), tally('ZZZ', 2, 9, 18)];
  assert.equal(hasTiedTopRank(tied, 'count'), true);
  assert.equal(dominantDistress(tied, 'count')?.distress, 'ZZZ');
});

test('a full tie still resolves deterministically, by count then name', () => {
  // Without a total order, a branch whose top two distresses tie could change
  // hazard class between runs on nothing but object key order.
  const onCount = rankDistresses([tally('ZZZ', 9, 1, 4), tally('AAA', 2, 1, 4)], 'severity_area');
  assert.equal(onCount[0].distress, 'ZZZ', 'higher count wins once severity_area ties');

  const onName = rankDistresses([tally('ZZZ', 2, 1, 4), tally('AAA', 2, 1, 4)], 'severity_area');
  assert.equal(onName[0].distress, 'AAA', 'name breaks a total tie');
});

test('hasTiedTopRank is false when the metric separates the top two', () => {
  const clear = [tally('AAA', 5, 1, 2), tally('ZZZ', 2, 9, 18)];
  assert.equal(hasTiedTopRank(clear, 'count'), false);
  assert.equal(hasTiedTopRank(clear, 'severity_area'), false);
  assert.equal(hasTiedTopRank([tally('AAA', 1, 1, 1)], 'count'), false, 'a lone tally is not tied');
});

test('dominantDistress on an empty bag is undefined, not a fabricated distress', () => {
  assert.equal(dominantDistress([], 'severity_area'), undefined);
});

/* --- Accumulation --------------------------------------------------------- */

test('addObservation folds records onto one canonical key and sums each metric', () => {
  const tallies = new Map<string, DistressTally>();
  // Two spellings of the same distress - the log's and the sample units' -
  // must land on one tally, or a branch covered by both double-counts.
  addObservation(tallies, 'ALLIGATOR/FATIGUE CRACK (RETAK KULIT BUAYA)', {
    area: 2,
    severity: 'BERAT',
  });
  addObservation(tallies, 'ALLIGATOR CRACKING', { area: 3, severity: 'RINGAN' });

  assert.equal(tallies.size, 1);
  const t = tallies.get('ALLIGATOR CR')!;
  assert.equal(t.count, 2);
  assert.equal(t.area, 5);
  assert.equal(t.severityArea, 2 * 3 + 3 * 1);
});

test('addObservation carries deduct for the sample-unit path without faking an area', () => {
  const tallies = new Map<string, DistressTally>();
  addObservation(tallies, 'RAVELING', { deduct: 12.5 });
  const t = tallies.get('RAVELING')!;
  assert.equal(t.deduct, 12.5);
  assert.equal(t.area, 0);
  assert.equal(t.severityArea, 0);
});

test('metricValue reads the field the metric names', () => {
  const t = tally('PATCHING', 9, 4, 8, 2.5);
  assert.equal(metricValue(t, 'count'), 9);
  assert.equal(metricValue(t, 'area'), 4);
  assert.equal(metricValue(t, 'severity_area'), 8);
  assert.equal(metricValue(t, 'deduct'), 2.5);
});

/* --- Severity weights ----------------------------------------------------- */

test('severityWeight maps the three Tingkat Kerusakan values and nothing else', () => {
  assert.equal(severityWeight('RINGAN'), 1);
  assert.equal(severityWeight('SEDANG'), 2);
  assert.equal(severityWeight('BERAT'), 3);
  assert.equal(severityWeight(' berat '), 3, 'trimmed and case-insensitive');
  assert.equal(severityWeight(undefined), 0);
  assert.equal(severityWeight('PARAH'), 0, 'an unknown level must not guess a weight');
});

test('canonicalDistress trims and uppercases before the alias lookup', () => {
  assert.equal(canonicalDistress('  pothole (lubang)  '), 'POTHOLE');
});

/* =============================================================================
 * THE COMMITTED DATA
 *
 * The metric disagreement quantified on the real log. These numbers are quoted
 * in riskScales.ts (why DOMINANT_DISTRESS_METRIC exists) and in the thesis, so
 * they are pinned here rather than restated from a run somebody did once.
 * ========================================================================== */

const committedLog = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/repair-log-2025.json', import.meta.url)), 'utf-8'),
);
const committedNetwork = new Set<string>(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../public/data/pavement-data.json', import.meta.url)), 'utf-8'),
  ).features.map((f: { properties: { Section: string } }) => f.properties.Section),
);

function committedTallies(): Record<string, DistressTally[]> {
  const parsed = validateRepairLog(committedLog);
  assert.ok(parsed.ok);
  return aggregateRepairLog(parsed.data, committedNetwork).byBranch;
}

const METRICS = ['count', 'area', 'severity_area'] as const;

test('07L/25R reports hazard class fod under all three metrics', () => {
  const tallies = committedTallies()['07L/25R'];
  for (const metric of METRICS) {
    const winner = dominantDistress(tallies, metric)!;
    assert.equal(
      DISTRESS_TO_HAZARD_CLASS[winner.distress],
      'fod',
      `${metric} picked ${winner.distress}`,
    );
  }
});

test('07L/25R top three: POTHOLE leads on count, PATCHING on area and severity', () => {
  const tallies = committedTallies()['07L/25R'];
  const top = (metric: (typeof METRICS)[number]) =>
    rankDistresses(tallies, metric)
      .slice(0, 3)
      .map((t) => t.distress);

  assert.deepEqual(top('count'), ['POTHOLE', 'PATCHING', 'ALLIGATOR CR']);
  assert.deepEqual(top('area'), ['PATCHING', 'ALLIGATOR CR', 'POTHOLE']);
  assert.deepEqual(top('severity_area'), ['PATCHING', 'ALLIGATOR CR', 'POTHOLE']);

  // The figures the branch detail panel prints.
  const byCount = rankDistresses(tallies, 'count');
  assert.equal(byCount[0].count, 157, 'POTHOLE record count');
  assert.equal(Math.round(byCount[1].area * 10) / 10, 66.2, 'PATCHING affected area, m²');
});

test('06/24 flips hazard class between count and the other two metrics', () => {
  const tallies = committedTallies()['06/24'];
  const classFor = (metric: (typeof METRICS)[number]) =>
    DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, metric)!.distress];

  assert.equal(classFor('count'), 'fod', 'PATCHING recurs most');
  assert.equal(classFor('area'), 'structural', 'L & T CR covers the most pavement');
  assert.equal(classFor('severity_area'), 'structural');
});

function hazardSplitBranches(byBranch: Record<string, DistressTally[]>): string[] {
  return Object.entries(byBranch)
    .filter(([, tallies]) => {
      const classes = METRICS.map(
        (m) => DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, m)!.distress] ?? 'other',
      );
      return new Set(classes).size > 1;
    })
    .map(([branch]) => branch)
    .sort();
}

test('the three metrics disagree on hazard class for 5 branches', () => {
  // riskScales.ts cites this figure as the reason DOMINANT_DISTRESS_METRIC is
  // a stated decision, so it is pinned rather than restated from a one-off run.
  //
  // The v2 brief said "6 of 30" while listing eight branches. Neither number
  // reproduces, because the branches involved include ones whose count metric
  // has a tied top rank (see the next test) - there the answer came from the
  // tie-break, not the data.
  assert.deepEqual(hazardSplitBranches(committedTallies()), [
    '06/24',
    'N1',
    'N4M',
    'N5',
    'NP3',
  ]);
});

test('none of the five hazard-class splits depends on how a count tie breaks', () => {
  // A disagreement statistic that moved when the tie-break changed would be an
  // artefact, not a finding. These five hold either way: the four tie-affected
  // branches that are not on the list stop splitting once ties defer to
  // severity_area, and N4M splits on area vs severity_area regardless of count.
  const byBranch = committedTallies();
  for (const branch of hazardSplitBranches(byBranch)) {
    const tallies = byBranch[branch];
    const areaClass = DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, 'area')!.distress];
    const severityClass =
      DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, 'severity_area')!.distress];
    const countClass = DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, 'count')!.distress];

    const splitsWithoutCount = areaClass !== severityClass;
    const countIsWellDefined = !hasTiedTopRank(tallies, 'count');
    assert.ok(
      splitsWithoutCount || countIsWellDefined,
      `${branch} splits only because of a count tie-break`,
    );
    assert.ok(countClass !== undefined);
  }
});

test('2 branches split on area vs severity_area alone, with count discarded entirely', () => {
  // The strongest form of the argument: even ignoring the metric that ties,
  // the choice between extent and extent-times-severity still moves the
  // consequence input on N1 and N4M.
  const byBranch = committedTallies();
  const split = Object.entries(byBranch)
    .filter(
      ([, tallies]) =>
        DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, 'area')!.distress] !==
        DISTRESS_TO_HAZARD_CLASS[dominantDistress(tallies, 'severity_area')!.distress],
    )
    .map(([branch]) => branch)
    .sort();

  assert.deepEqual(split, ['N1', 'N4M']);
});

test('count is not well-defined on 5 branches; area and severity_area tie nowhere', () => {
  // The sharper argument for DOMINANT_DISTRESS_METRIC = severity_area: one
  // candidate metric fails to single out a distress on a sixth of the covered
  // network, while the chosen one always does.
  const byBranch = committedTallies();
  const tiedOn = (metric: (typeof METRICS)[number]) =>
    Object.entries(byBranch)
      .filter(([, tallies]) => hasTiedTopRank(tallies, metric))
      .map(([branch]) => branch)
      .sort();

  assert.deepEqual(tiedOn('count'), ['EC1', 'N4M', 'N6', 'N7', 'NC2']);
  assert.deepEqual(tiedOn('area'), []);
  assert.deepEqual(tiedOn('severity_area'), []);
});

test('a count tie falls back to severity_area, not to alphabetical order', () => {
  // N6 records PATCHING twice and L & T CR twice. Alphabetical would hand the
  // branch to 'L & T CR' by accident of spelling; deferring to severity_area
  // hands it to the distress the calibrated metric actually ranks first, which
  // on N6 happens to be the same one - but for a stated reason.
  const tallies = committedTallies()['N6'];
  assert.equal(hasTiedTopRank(tallies, 'count'), true);

  const winner = dominantDistress(tallies, 'count')!;
  const bySeverityArea = dominantDistress(tallies, 'severity_area')!;
  assert.equal(winner.distress, bySeverityArea.distress);
});

test('count and area disagree on the distress NAME for 9 of the 31 covered branches', () => {
  const byBranch = committedTallies();
  const differing = Object.entries(byBranch)
    .filter(
      ([, tallies]) =>
        dominantDistress(tallies, 'count')!.distress !==
        dominantDistress(tallies, 'area')!.distress,
    )
    .map(([branch]) => branch)
    .sort();

  assert.equal(Object.keys(byBranch).length, 31);
  assert.deepEqual(differing, [
    '06/24', '07L/25R', 'Apron G', 'N1', 'N4M', 'N5', 'NP1', 'NP2', 'NP3',
  ]);

  // 8 of the 9 hold regardless of tie-breaking; only N4M depends on it.
  const unambiguous = differing.filter((b) => !hasTiedTopRank(byBranch[b], 'count'));
  assert.equal(unambiguous.length, 8);
  assert.deepEqual(differing.filter((b) => hasTiedTopRank(byBranch[b], 'count')), ['N4M']);
});
