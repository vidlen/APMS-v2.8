/**
 * repair-log.test.ts
 * -----------------------------------------------------------------------------
 * Tests 1-8 of the v2.8 brief. The join from a free-text facility label to a
 * Section code is the part of this feature that can be wrong in silence -
 * a record landing on the wrong branch still produces a plausible-looking
 * register row - so the resolution rules get the coverage.
 *
 * The distress-name and hazard-class assertions (tests 6 and 7) run against
 * DISTRESS_TO_HAZARD_CLASS directly, so an alias that stops reaching its
 * intended class fails here rather than showing up as a quietly downgraded
 * consequence somewhere in the register.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  aggregateRepairLog,
  resolveBranch,
  validateRepairLog,
  type RepairLogRecord,
} from './repair-log.ts';
import { canonicalDistress } from './dominant-distress.ts';
import {
  DISTRESS_TO_HAZARD_CLASS,
  LOCATION_BRANCH_PATTERN,
  REPAIR_LOG_NO_RECORD_IN_WINDOW,
} from '../config/riskScales.ts';

// The Section codes of the committed network (pavement-data.json), as far as
// the join cares. Includes N3/N3M/N6/N7M/M1 so the precedence tests are real,
// and deliberately EXCLUDES M3 so test 4b has something to reject.
const NETWORK = new Set([
  '06/24',
  '07L/25R',
  '07R/25L',
  'N1',
  'N3',
  'N3M',
  'N5',
  'N6',
  'N7',
  'N7M',
  'NC2',
  'NP1',
  'NP2',
  'NP3',
  'M1',
  'SC2',
  'Apron A',
  'Apron B',
]);

function record(patch: Partial<RepairLogRecord> = {}): RepairLogRecord {
  return {
    date: '2025-09-01',
    facility: 'RUNWAY 07L/25R',
    location: 'Sta 3302',
    findingType: 'TEMUAN INSPEKSI',
    distressAsphalt: 'POTHOLE (LUBANG)',
    severity: 'BERAT',
    areaM2: 1,
    ...patch,
  };
}

/* --- Test 1: a direct facility label ------------------------------------- */

test('1. RUNWAY 06-24 resolves to the Section code 06/24', () => {
  const result = resolveBranch({ facility: 'RUNWAY 06-24', location: '' }, NETWORK);
  assert.deepEqual(result, { ok: true, branch: '06/24', via: 'facility' });
});

/* --- Test 2: a group label resolved from its location text --------------- */

test('2. GATE TAXIWAY N1-N9 with location "EXIT N3" resolves to N3', () => {
  const result = resolveBranch(
    { facility: 'GATE TAXIWAY N1-N9', location: 'EXIT N3' },
    NETWORK,
  );
  assert.deepEqual(result, { ok: true, branch: 'N3', via: 'location' });
});

/* --- Test 3: the word boundary, not the alternation order ---------------- */

test('3. location "Depan N3M" resolves to N3M and never to N3', () => {
  const result = resolveBranch(
    { facility: 'GATE CROSS TAXIWAY N3M-N8M', location: 'Depan N3M' },
    NETWORK,
  );
  assert.deepEqual(result, { ok: true, branch: 'N3M', via: 'location' });
});

test('3b. removing the trailing \\b from the pattern is what breaks N3M', () => {
  // Guards the boundary itself rather than the module: if a future edit drops
  // the \b from LOCATION_BRANCH_PATTERN, N3M starts matching as N3 and six
  // records move onto the wrong branch in silence. This asserts that the
  // boundary - not the order of the alternation - is doing that work.
  const withBoundary = LOCATION_BRANCH_PATTERN.exec('DEPAN N3M');
  assert.equal(withBoundary?.[1], 'N3M');

  const withoutBoundary = /(N[1-9]M|N[1-9]|NC[1-9]|M[1-8]|SC[1-9]|S[1-9])/;
  assert.equal(withoutBoundary.exec('DEPAN N3M')?.[1], 'N3M', 'order alone still finds N3M');

  // ...but reverse the alternation and only the boundary saves it.
  const reordered = /\b(N[1-9]|N[1-9]M|NC[1-9]|M[1-8]|SC[1-9]|S[1-9])\b/;
  assert.equal(reordered.exec('DEPAN N3M')?.[1], 'N3M', 'the \\b rejects the short N3 match');

  const reorderedNoBoundary = /(N[1-9]|N[1-9]M|NC[1-9]|M[1-8]|SC[1-9]|S[1-9])/;
  assert.equal(
    reorderedNoBoundary.exec('DEPAN N3M')?.[1],
    'N3',
    'without the \\b, N3M is read as N3',
  );
});

/* --- Test 4: the location text beats the facility label ------------------ */

test('4. all three misfiled records follow their location, not their facility', () => {
  // Verified against the committed log on 2026-08-14. The brief names two of
  // these; the third (EXIT N6 filed under the N3M-N8M group) is real too.
  const misfiled = [
    { facility: 'GATE TAXIWAY N1-N9', location: 'Sta 2500 depan n7m', expected: 'N7M' },
    { facility: 'GATE TAXIWAY N1-N9', location: 'Exit M1', expected: 'M1' },
    { facility: 'GATE CROSS TAXIWAY N3M-N8M', location: 'EXIT N6', expected: 'N6' },
  ];

  for (const { facility, location, expected } of misfiled) {
    const result = resolveBranch({ facility, location }, NETWORK);
    assert.deepEqual(
      result,
      { ok: true, branch: expected, via: 'location' },
      `${facility} / ${location}`,
    );
  }
});

test('4b. a location code the network does not have stays unresolved', () => {
  // LOCATION_BRANCH_PATTERN matches M3, but the network has no M3. The
  // existence guard, not the pattern, is what stops a phantom branch.
  assert.equal(LOCATION_BRANCH_PATTERN.exec('EXIT M3')?.[1], 'M3');
  const result = resolveBranch({ facility: 'GATE TAXIWAY M1-M8', location: 'EXIT M3' }, NETWORK);
  assert.deepEqual(result, { ok: false, via: 'unresolved_group' });
});

/* --- Test 5: a facility that is not a branch at all ---------------------- */

test('5. APRON KARGO is unresolved, counted, and never guessed', () => {
  const result = resolveBranch({ facility: 'APRON KARGO', location: 'Apron kargo' }, NETWORK);
  assert.deepEqual(result, { ok: false, via: 'unknown_facility' });

  const aggregate = aggregateRepairLog(
    [record({ facility: 'APRON KARGO', location: 'Apron kargo' })],
    NETWORK,
  );
  assert.equal(aggregate.stats.unknownFacility, 1);
  assert.deepEqual(aggregate.byBranch, {});
  assert.equal(aggregate.unresolved.length, 1);
  assert.equal(aggregate.unresolved[0].reason, 'unknown_facility');
});

/* --- Tests 6 and 7: every alias reaches its intended hazard class --------- */

test('6. each of the 15 asphalt distress strings reaches its intended hazard class', () => {
  const expected: Record<string, string> = {
    'ALLIGATOR/FATIGUE CRACK (RETAK KULIT BUAYA)': 'structural',
    'ASPHALT STRIPPING (MENGELUPAS)': 'fod',
    'BLEEDING (KEGEMUKAN)': 'friction',
    'BLOCK CRACK (RETAK BLOK)': 'structural',
    'CORRUGATION (BERGELOMBANG)': 'friction',
    'DEPRESSION (AMBLAS)': 'friction',
    'JOINT REFLECTION CRACK - PCC (RETAK SAMBUNGAN - PCC)': 'structural',
    'LONGITUDINAL AND TRANSVERSAL CRACK (RETAK MEMANJANG DAN MELINTANG)': 'structural',
    'PATCHING (TAMBALAN)': 'fod',
    'POTHOLE (LUBANG)': 'fod',
    'RAVELING AND WEATHERING (BUTIRAN LEPAS DAN PELAPUKAN)': 'fod',
    'RUTTING (ALUR)': 'friction',
    'SHOVING OF ASPHALT PAVEMENT FROM PCC (SUNGKUR)': 'friction',
    'SLIPPAGE CRACK (RETAK SABIT)': 'structural',
    'SWELLING (PENGEMBANGAN)': 'friction',
  };

  assert.equal(Object.keys(expected).length, 15);
  for (const [raw, hazardClass] of Object.entries(expected)) {
    assert.equal(
      DISTRESS_TO_HAZARD_CLASS[canonicalDistress(raw)],
      hazardClass,
      `${raw} should reach ${hazardClass}`,
    );
  }
});

test('7. each of the 5 concrete distress strings reaches its intended hazard class', () => {
  const expected: Record<string, string> = {
    'CORNER CRACK (RETAK SUDUT)': 'structural',
    'SPALLING (LONGITUDINAL AND TRANSVERSE JOINT)': 'fod',
    'SPALLING (CORNER)': 'fod',
    'PATCHING BESAR (LEBIH DARI 0,5 M2) DAN GALIAN UTILITAS': 'fod',
    'POTHOLES (LUBANG)': 'fod',
  };

  assert.equal(Object.keys(expected).length, 5);
  for (const [raw, hazardClass] of Object.entries(expected)) {
    assert.equal(
      DISTRESS_TO_HAZARD_CLASS[canonicalDistress(raw)],
      hazardClass,
      `${raw} should reach ${hazardClass}`,
    );
  }
});

test('the sample-unit spellings canonicalise onto the same keys as the log', () => {
  // The point of keeping both spellings in one alias table: a branch covered
  // by a PCI survey AND the log has to be comparable across the two.
  assert.equal(canonicalDistress('ALLIGATOR CRACKING'), 'ALLIGATOR CR');
  assert.equal(
    canonicalDistress('ALLIGATOR/FATIGUE CRACK (RETAK KULIT BUAYA)'),
    'ALLIGATOR CR',
  );
  assert.equal(canonicalDistress('LONGITUDINAL & TRANSVERSE CRACKING'), 'L & T CR');
  assert.equal(canonicalDistress('JOINT REFLECTION CRACKING'), 'JT REFLECTION CR');
});

test('an unrecognised distress string passes through uppercased, not dropped', () => {
  // One place decides "unknown -> other": DISTRESS_TO_HAZARD_CLASS. The alias
  // table must not swallow the string before it gets there.
  assert.equal(canonicalDistress('  some new distress  '), 'SOME NEW DISTRESS');
  assert.equal(DISTRESS_TO_HAZARD_CLASS['SOME NEW DISTRESS'], undefined);
});

/* --- Test 8: a row with no distress type --------------------------------- */

test('8. a row with no distress type is skipped and counted, never scored as other', () => {
  const aggregate = aggregateRepairLog(
    [
      record({ distressAsphalt: undefined, distressConcrete: undefined }),
      record({ distressAsphalt: 'POTHOLE (LUBANG)' }),
    ],
    NETWORK,
  );

  assert.equal(aggregate.stats.skippedNoDistress, 1);
  assert.equal(aggregate.stats.aggregated, 1);
  assert.deepEqual(Object.keys(aggregate.byBranch), ['07L/25R']);
  assert.deepEqual(
    aggregate.byBranch['07L/25R'].map((t) => t.distress),
    ['POTHOLE'],
    'the blank row contributes no tally at all',
  );
});

test('a concrete distress is used when the asphalt column is blank', () => {
  const aggregate = aggregateRepairLog(
    [record({ distressAsphalt: undefined, distressConcrete: 'CORNER CRACK (RETAK SUDUT)' })],
    NETWORK,
  );
  assert.equal(aggregate.stats.skippedNoDistress, 0);
  assert.deepEqual(
    aggregate.byBranch['07L/25R'].map((t) => t.distress),
    ['CORNER CR'],
  );
});

test('a record with no severity still tallies, contributes 0 to severity_area, and is counted', () => {
  const aggregate = aggregateRepairLog([record({ severity: undefined, areaM2: 5 })], NETWORK);
  const tally = aggregate.byBranch['07L/25R'][0];

  assert.equal(aggregate.stats.aggregatedWithoutSeverity, 1);
  assert.equal(tally.count, 1);
  assert.equal(tally.area, 5);
  assert.equal(tally.severityArea, 0, 'a blank severity must not invent a RINGAN weight');
});

/* --- Validation ---------------------------------------------------------- */

test('validateRepairLog accepts a well-formed record and trims it', () => {
  const result = validateRepairLog([
    {
      date: ' 2025-09-01 ',
      facility: ' RUNWAY 06-24 ',
      location: 'Sta 100',
      findingType: 'TEMUAN INSPEKSI',
      areaM2: 1.5,
      volumeM3: 0.09,
    },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data[0].date, '2025-09-01');
    assert.equal(result.data[0].facility, 'RUNWAY 06-24');
    assert.equal(result.data[0].method, undefined);
  }
});

test('validateRepairLog accepts a record with a blank Metode Perbaikan', () => {
  // 3 of the 678 committed records are in this state. Failing the import over
  // a missing repair method would reject the airport's real data.
  const result = validateRepairLog([
    {
      date: '2025-09-01',
      facility: 'RUNWAY 06-24',
      location: 'Sta 100',
      findingType: 'TEMUAN INSPEKSI',
      areaM2: 1,
    },
  ]);
  assert.equal(result.ok, true);
});

test('validateRepairLog rejects a non-array payload', () => {
  assert.equal(validateRepairLog({ facility: 'RUNWAY 06-24' }).ok, false);
});

test('validateRepairLog rejects a missing facility', () => {
  const result = validateRepairLog([
    { date: '2025-09-01', location: 'x', findingType: 'TEMUAN INSPEKSI', areaM2: 1 },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /facility/);
});

test('validateRepairLog rejects a negative or non-numeric area', () => {
  const base = {
    date: '2025-09-01',
    facility: 'RUNWAY 06-24',
    location: 'x',
    findingType: 'TEMUAN INSPEKSI',
  };
  assert.equal(validateRepairLog([{ ...base, areaM2: -1 }]).ok, false);
  assert.equal(validateRepairLog([{ ...base, areaM2: '1.5' }]).ok, false);
  assert.equal(validateRepairLog([{ ...base, areaM2: Number.NaN }]).ok, false);
});

test('validateRepairLog fails the whole import on one bad row', () => {
  // Not a partial import: a dropped row could silently move a branch's
  // dominant distress, or drop it to a weaker evidence source, unnoticed.
  const good = {
    date: '2025-09-01',
    facility: 'RUNWAY 06-24',
    location: 'x',
    findingType: 'TEMUAN INSPEKSI',
    areaM2: 1,
  };
  const result = validateRepairLog([good, { ...good, areaM2: 'oops' }, good]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Record 1/);
});

/* --- Aggregate bookkeeping ------------------------------------------------ */

test('aggregateRepairLog reports every route and every branch it covered', () => {
  const aggregate = aggregateRepairLog(
    [
      record({ facility: 'RUNWAY 06-24' }),
      record({ facility: 'GATE TAXIWAY N1-N9', location: 'EXIT N3' }),
      record({ facility: 'GATE TAXIWAY M1-M8', location: 'no code here' }),
      record({ facility: 'APRON KARGO' }),
    ],
    NETWORK,
  );

  assert.deepEqual(
    {
      total: aggregate.stats.total,
      byFacility: aggregate.stats.byFacility,
      byLocation: aggregate.stats.byLocation,
      unresolvedGroup: aggregate.stats.unresolvedGroup,
      unknownFacility: aggregate.stats.unknownFacility,
      branchesCovered: aggregate.stats.branchesCovered,
    },
    { total: 4, byFacility: 1, byLocation: 1, unresolvedGroup: 1, unknownFacility: 1, branchesCovered: 2 },
  );
  assert.deepEqual(Object.keys(aggregate.byBranch).sort(), ['06/24', 'N3']);
});

/* =============================================================================
 * THE COMMITTED DATA
 *
 * Everything above is a hand-built fixture. These run the real converted log
 * against the real network and pin the figures the coverage panel will print
 * and the thesis will quote. They are the v2.8 acceptance criteria made
 * executable: a future edit to the alias table, the pattern or the join that
 * moves any of these numbers fails here rather than quietly restating the
 * airport's coverage.
 * ========================================================================== */

function loadJson(relativePath: string): unknown {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf-8'));
}

const committedLog = loadJson('../../public/data/repair-log-2025.json');
const committedNetwork = new Set<string>(
  (loadJson('../../public/data/pavement-data.json') as {
    features: { properties: { Section: string } }[];
  }).features.map((f) => f.properties.Section),
);

test('the committed network is the 75 branches the register scores', () => {
  assert.equal(committedNetwork.size, 75);
});

test('the committed log validates as 678 records', () => {
  const result = validateRepairLog(committedLog);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  if (result.ok) assert.equal(result.data.length, 678);
});

test('the committed log resolves 606 by facility, 64 by location, 6+2 not at all', () => {
  const parsed = validateRepairLog(committedLog);
  assert.ok(parsed.ok);
  const { stats } = aggregateRepairLog(parsed.data, committedNetwork);

  assert.deepEqual(
    {
      total: stats.total,
      byFacility: stats.byFacility,
      byLocation: stats.byLocation,
      unresolvedGroup: stats.unresolvedGroup,
      unknownFacility: stats.unknownFacility,
      skippedNoDistress: stats.skippedNoDistress,
      aggregatedWithoutSeverity: stats.aggregatedWithoutSeverity,
      branchesCovered: stats.branchesCovered,
    },
    {
      total: 678,
      byFacility: 606,
      byLocation: 64,
      unresolvedGroup: 6,
      unknownFacility: 2, // both APRON KARGO
      skippedNoDistress: 18,
      aggregatedWithoutSeverity: 2, // both on 07L/25R
      branchesCovered: 31,
    },
  );
});

test('the 44 branches the log never reaches are exactly the expected ones', () => {
  const parsed = validateRepairLog(committedLog);
  assert.ok(parsed.ok);
  const { byBranch } = aggregateRepairLog(parsed.data, committedNetwork);
  const uncovered = [...committedNetwork].filter((b) => !byBranch[b]).sort();

  // 12 north-side branches whose siblings DO appear in the log - no repair was
  // recorded in the window - and 32 outside the log's "Unit: North Runway"
  // scope. The coverage panel has to tell those two gaps apart. The 12 is a
  // real runtime constant (riskScales.ts), not just a test fixture, so the
  // panel can render the split - assert against it rather than a second
  // hand-typed copy.
  const noRecordInWindow = [...REPAIR_LOG_NO_RECORD_IN_WINDOW].sort();
  const outsideLogScope = [
    'Apron C', 'Apron D', 'Apron E', 'Apron H', 'Apron I', 'Apron J', 'Apron K',
    'Remote Apron B', 'Remote Apron C', 'Remote Apron D',
    'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9',
    'SC1', 'SC2', 'SC3', 'SC4', 'SC5', 'SC6', 'SC8', 'SC9', 'SCX',
    'SP2', 'SPE', 'WC1', 'WC2',
  ];

  assert.equal(noRecordInWindow.length, 12);
  assert.equal(outsideLogScope.length, 32);
  assert.equal(uncovered.length, 44);
  assert.deepEqual(uncovered, [...noRecordInWindow, ...outsideLogScope].sort());
});
