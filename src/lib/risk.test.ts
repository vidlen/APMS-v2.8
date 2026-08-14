/**
 * risk.test.ts
 * -----------------------------------------------------------------------------
 * Runnable check for the Fine-Kinney engine and the ICAO crosswalk that fixes
 * the saturation defect (see the notes in riskScales.ts and icaoMatrix.ts).
 *
 * Uses node:test + node:assert/strict - no new dependency. Run with:
 *   npm test
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBranch, findDegreeZoneDisagreements, WORKED_EXAMPLES, type BranchRiskInput } from './risk.ts';

// Every worked example's comment assumes it is evaluated at this year - see
// the "Note for the thesis" on TW-NP-12 in risk.ts. Today's real date is well
// past 2025; pin the year so this test is a fixture, not a moving target.
const FIXTURE_YEAR = 2025;

/* =============================================================================
 * §6 verified crosswalk - all 8 rows, table-driven.
 *
 * Each row uses dominantDistress 'RAVELING' (hazard class 'fod') and a
 * lastInspectionYear equal to FIXTURE_YEAR, so recency escalation never fires
 * and L comes straight from PCI_TO_LIKELIHOOD.
 * ========================================================================== */

const CROSSWALK_CASES: Array<{
  label: string;
  input: BranchRiskInput;
  expectedR: number;
  expectedDegree: number;
  expectedLF: number;
  expectedCell: string;
  expectedZone: string;
}> = [
  {
    label: 'Runway, PCI >= 95',
    input: {
      branchId: 'T-1', branchName: 'test', role: 'runway',
      currentPci: 96, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 40, expectedDegree: 2, expectedLF: 1.0, expectedCell: '2B', expectedZone: 'Tolerable',
  },
  {
    label: 'Runway, PCI 81-85',
    input: {
      branchId: 'T-2', branchName: 'test', role: 'runway',
      currentPci: 83, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 200, expectedDegree: 4, expectedLF: 5.0, expectedCell: '3B', expectedZone: 'Tolerable',
  },
  {
    label: 'Runway, PCI 71-80 (the saturation case)',
    input: {
      branchId: 'T-3', branchName: 'test', role: 'runway',
      currentPci: 79, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 400, expectedDegree: 5, expectedLF: 10.0, expectedCell: '4B', expectedZone: 'Intolerable',
  },
  {
    label: 'Runway, PCI 41-55',
    input: {
      branchId: 'T-4', branchName: 'test', role: 'runway',
      currentPci: 50, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 2400, expectedDegree: 5, expectedLF: 60.0, expectedCell: '5B', expectedZone: 'Intolerable',
  },
  {
    label: 'Parallel taxiway, PCI 56-70',
    input: {
      branchId: 'T-5', branchName: 'test', role: 'parallel_taxiway',
      currentPci: 60, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 270, expectedDegree: 4, expectedLF: 18.0, expectedCell: '4C', expectedZone: 'Tolerable',
  },
  {
    label: 'Parallel taxiway, PCI < 41',
    input: {
      branchId: 'T-6', branchName: 'test', role: 'parallel_taxiway',
      currentPci: 30, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 900, expectedDegree: 5, expectedLF: 60.0, expectedCell: '5C', expectedZone: 'Intolerable',
  },
  {
    label: 'Active apron, PCI < 41',
    input: {
      branchId: 'T-7', branchName: 'test', role: 'active_apron',
      currentPci: 30, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 420, expectedDegree: 5, expectedLF: 60.0, expectedCell: '5D', expectedZone: 'Tolerable',
  },
  {
    label: 'Remote apron, PCI < 41',
    input: {
      branchId: 'T-8', branchName: 'test', role: 'remote_apron',
      currentPci: 30, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    expectedR: 60, expectedDegree: 2, expectedLF: 20.0, expectedCell: '4D', expectedZone: 'Tolerable',
  },
];

test('§6 verified crosswalk - all 8 rows', () => {
  for (const c of CROSSWALK_CASES) {
    const result = scoreBranch(c.input, FIXTURE_YEAR);
    assert.equal(result.riskScore, c.expectedR, `${c.label}: R`);
    assert.equal(result.band.degree, c.expectedDegree, `${c.label}: FK degree`);
    assert.equal(result.likelihood * result.frequency, c.expectedLF, `${c.label}: L x F`);
    assert.equal(result.icao.cell, c.expectedCell, `${c.label}: ICAO cell`);
    assert.equal(result.icao.zone, c.expectedZone, `${c.label}: ICAO zone`);
  }
});

/* =============================================================================
 * The regression this whole commit exists for: a runway in Satisfactory
 * condition (PCI 71-80) must never carry an instruction to discontinue or
 * cease operation, even though it still reaches Fine-Kinney degree 5.
 * ========================================================================== */

test('saturation defect: PCI 79 runway reaches FK degree 5 but is not told to discontinue', () => {
  const result = scoreBranch(
    {
      branchId: 'RW-79', branchName: 'Runway at PCI 79', role: 'runway',
      currentPci: 79, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING',
    },
    FIXTURE_YEAR,
  );

  assert.equal(result.band.degree, 5, 'still reaches Kinney degree 5 - the ranking is correct');
  assert.equal(result.icao.zone, 'Intolerable', 'ICAO verdict flags it - correctly, via probability/severity, not via R');
  assert.doesNotMatch(
    result.recommendedAction,
    /discontinu|cease|close/i,
    'the operational verdict must read as "reduce the risk", never as an instruction to stop using the branch',
  );
});

/* =============================================================================
 * WORKED_EXAMPLES - the three cases the thesis quotes directly.
 * ========================================================================== */

test('worked example: RW-0624-C -> R 80, degree 3', () => {
  const result = scoreBranch(WORKED_EXAMPLES[0], FIXTURE_YEAR);
  assert.equal(result.likelihood, 0.2);
  assert.equal(result.frequency, 10);
  assert.equal(result.consequence, 40);
  assert.equal(result.riskScore, 80);
  assert.equal(result.band.degree, 3);
  assert.equal(result.likelihoodTier, 'pci');
});

test('worked example: AP-REMOTE-04 -> R 36, degree 2', () => {
  const result = scoreBranch(WORKED_EXAMPLES[1], FIXTURE_YEAR);
  assert.equal(result.likelihood, 6);
  assert.equal(result.frequency, 2);
  assert.equal(result.consequence, 3);
  assert.equal(result.riskScore, 36);
  assert.equal(result.band.degree, 2);
});

test('worked example: TW-NP-12 -> stale survey escalates L, R 90, degree 3', () => {
  const result = scoreBranch(WORKED_EXAMPLES[2], FIXTURE_YEAR);
  assert.equal(result.recencyEscalationSteps, 1, '2019 to 2025 is 6 years stale -> +1 step');
  assert.equal(result.likelihood, 1, '0.5 escalated one step');
  assert.equal(result.frequency, 6);
  assert.equal(result.consequence, 15);
  assert.equal(result.riskScore, 90);
  assert.equal(result.band.degree, 3);
});

/* =============================================================================
 * Detectability (backlog C, locked decision 6). The label is always
 * computed; it must NEVER move the score unless explicitly set on the
 * input - that's what keeps AP-REMOTE-04's pinned R=36 true above despite
 * carrying a structural (hidden) hazard.
 * ========================================================================== */

test('detectability label is inferred by hazard class but never auto-applied to the score', () => {
  // AP-REMOTE-04: ALLIGATOR CR -> structural -> 'hidden' by default. No
  // `detectability` set on the input, so this must match the pinned worked
  // example above exactly (R=36) - proof the inferred label has zero score
  // effect on its own.
  const structural = scoreBranch(WORKED_EXAMPLES[1], FIXTURE_YEAR);
  assert.equal(structural.detectability, 'hidden');
  assert.equal(structural.detectabilityApplied, false);
  assert.equal(structural.detectabilityEscalationSteps, 0);
  assert.equal(structural.riskScore, 36, 'must still match the pinned worked example');

  // RW-0624-C: RAVELING -> fod -> 'visible' by default.
  const fod = scoreBranch(WORKED_EXAMPLES[0], FIXTURE_YEAR);
  assert.equal(fod.detectability, 'visible');
  assert.equal(fod.detectabilityApplied, false);
});

test('an explicit hidden detectability override escalates L by one step', () => {
  const withoutOverride = scoreBranch(WORKED_EXAMPLES[1], FIXTURE_YEAR);
  const withOverride = scoreBranch(
    { ...WORKED_EXAMPLES[1], detectability: 'hidden' },
    FIXTURE_YEAR,
  );

  assert.equal(withOverride.detectabilityApplied, true);
  assert.equal(withOverride.detectabilityEscalationSteps, 1);
  assert.equal(withOverride.likelihood, 10, '6 escalated one step, clamped at the scale ceiling');
  assert.equal(withOverride.riskScore, 60, '10 x 2 x 3, up from the un-escalated 36');
  assert.ok(
    withOverride.riskScore > withoutOverride.riskScore,
    'the override is a deliberate escalation, applied only when explicitly set',
  );
});

test('an explicit visible detectability override applies (is traced) but adds zero steps', () => {
  const result = scoreBranch(
    { ...WORKED_EXAMPLES[1], detectability: 'visible' },
    FIXTURE_YEAR,
  );
  assert.equal(result.detectabilityApplied, true, 'explicitly set, so it counts as applied');
  assert.equal(result.detectabilityEscalationSteps, 0, "'visible' carries no escalation");
  assert.equal(result.riskScore, 36, 'score unchanged from the un-escalated baseline');
});

/* =============================================================================
 * Phase 8 (gated): explicit distress-severity override escalates C. Mirrors
 * the detectability tests above exactly - same opt-in shape, same worked
 * example (AP-REMOTE-04: L 6, F 2, C 3, R 36 with no override).
 * ========================================================================== */

test('WORKED_EXAMPLES set no distressSeverity - the pinned figures stay unaffected by Phase 8', () => {
  for (const example of WORKED_EXAMPLES) {
    assert.equal(example.distressSeverity, undefined);
    const result = scoreBranch(example, FIXTURE_YEAR);
    assert.equal(result.distressSeverity, undefined);
    assert.equal(result.consequenceEscalationSteps, 0);
  }
});

test('an explicit BERAT severity override escalates C by one step', () => {
  const withoutOverride = scoreBranch(WORKED_EXAMPLES[1], FIXTURE_YEAR);
  const withOverride = scoreBranch(
    { ...WORKED_EXAMPLES[1], distressSeverity: 'BERAT' },
    FIXTURE_YEAR,
  );

  assert.equal(withOverride.distressSeverity, 'BERAT');
  assert.equal(withOverride.consequenceEscalationSteps, 1);
  assert.equal(withOverride.consequence, 7, 'C 3 escalated one CONSEQUENCE_SCALE step to 7');
  assert.equal(withOverride.riskScore, 84, '6 x 2 x 7, up from the un-escalated 36');
  assert.ok(
    withOverride.riskScore > withoutOverride.riskScore,
    'the override is a deliberate escalation, applied only when explicitly set',
  );
});

test('RINGAN and SEDANG severity overrides are traced but escalate nothing', () => {
  for (const level of ['RINGAN', 'SEDANG'] as const) {
    const result = scoreBranch({ ...WORKED_EXAMPLES[1], distressSeverity: level }, FIXTURE_YEAR);
    assert.equal(result.distressSeverity, level);
    assert.equal(result.consequenceEscalationSteps, 0, `'${level}' carries no escalation`);
    assert.equal(result.consequence, 3, 'C unchanged from the un-escalated baseline');
    assert.equal(result.riskScore, 36);
    assert.ok(
      result.trace.some((line) => line.includes(`severity set to '${level}'`)),
      'the override is traced even though it has no score effect',
    );
  }
});

test('an explicit overrides.consequence still wins outright over a BERAT severity escalation', () => {
  const result = scoreBranch(
    {
      ...WORKED_EXAMPLES[1],
      distressSeverity: 'BERAT',
      overrides: { consequence: 99 },
    },
    FIXTURE_YEAR,
  );
  assert.equal(result.consequence, 99, 'the expert override replaces the severity-escalated value');
  assert.equal(result.overridden, true);
});

test('escalateConsequence clamps at the CONSEQUENCE_SCALE ceiling like escalateLikelihood does', () => {
  const result = scoreBranch(
    { ...WORKED_EXAMPLES[0], role: 'runway', distressSeverity: 'BERAT' }, // C already 40 (fod, runway)
    FIXTURE_YEAR,
  );
  assert.equal(result.consequence, 100, 'C 40 escalated one step to the scale ceiling, not past it');
});

/* =============================================================================
 * findDegreeZoneDisagreements (backlog J, comparison 2). Reuses the same
 * runway-at-various-PCI inputs as the §6 crosswalk table above, since those
 * already pin exactly which (degree, zone) pairs occur.
 * ========================================================================== */

test('findDegreeZoneDisagreements flags a high FK degree that ICAO does not call Intolerable', () => {
  // PCI 81-85 runway: FK degree 4, ICAO cell 3B (Tolerable) - see the §6
  // crosswalk case above. Kinney's degree 4 reads as high risk; ICAO's
  // bounded assessment disagrees. This is the saturation defect's shape.
  const runway83 = scoreBranch(
    { branchId: 'T-2', branchName: 'test', role: 'runway', currentPci: 83, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING' },
    FIXTURE_YEAR,
  );
  assert.equal(runway83.band.degree, 4);
  assert.equal(runway83.icao.zone, 'Tolerable');
  assert.deepEqual(findDegreeZoneDisagreements([runway83]), [runway83]);
});

test('findDegreeZoneDisagreements does not flag agreement, even when both are severe', () => {
  // PCI 71-80 runway: FK degree 5 AND ICAO Intolerable (the saturation
  // regression case above). Both methods flag it - that's agreement on
  // severity, even though the recommended action text still differs.
  const runway79 = scoreBranch(
    { branchId: 'T-3', branchName: 'test', role: 'runway', currentPci: 79, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING' },
    FIXTURE_YEAR,
  );
  assert.equal(runway79.band.degree, 5);
  assert.equal(runway79.icao.zone, 'Intolerable');
  assert.deepEqual(findDegreeZoneDisagreements([runway79]), []);
});

test('findDegreeZoneDisagreements does not flag a low-degree, non-Intolerable branch', () => {
  // PCI >= 95 runway: FK degree 2, ICAO cell 2B (Tolerable) - low severity
  // by both methods, nothing to highlight.
  const runway96 = scoreBranch(
    { branchId: 'T-1', branchName: 'test', role: 'runway', currentPci: 96, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING' },
    FIXTURE_YEAR,
  );
  assert.equal(runway96.band.degree, 2);
  assert.equal(runway96.icao.zone, 'Tolerable');
  assert.deepEqual(findDegreeZoneDisagreements([runway96]), []);
});

/* =============================================================================
 * Expert L/F/C overrides (backlog L). This mechanism has existed in
 * scoreBranch since the draft, but was unreachable from any UI until the
 * Admin "Override L/F/C" dialog - and had no test coverage until now.
 * ========================================================================== */

test('an L/F/C override replaces the computed value, moves R, and re-derives the ICAO cell from it', () => {
  const base = { ...WORKED_EXAMPLES[1] }; // AP-REMOTE-04: L 6, F 2, C 3 computed, R 36, cell 4D
  const overridden = scoreBranch(
    {
      ...base,
      overrides: {
        consequence: 40,
        note: 'Expert panel: consequence underestimated by the hazard-class default',
        setBy: 'J. Doe',
        setOn: '2026-01-15',
      },
    },
    FIXTURE_YEAR,
  );

  assert.equal(overridden.overridden, true);
  assert.equal(overridden.likelihood, 6, 'L is untouched - only C was overridden');
  assert.equal(overridden.frequency, 2, 'F is untouched');
  assert.equal(overridden.consequence, 40, 'override replaces the computed C (3), not added to it');
  assert.equal(overridden.riskScore, 480, '6 x 2 x 40, not the un-overridden 36');
  assert.ok(
    overridden.trace.some((line) => line.includes('C overridden 3 -> 40')),
    'the override must be visible in the trace (locked decision 10), not a silent change',
  );
  assert.ok(
    overridden.trace.some((line) => line.includes('Expert panel')),
    'the override note is also traced',
  );

  // The ICAO crosswalk must be re-derived from the overridden C, not the
  // computed one (confirms the crosswalk really is computed after overrides
  // are applied, see the comment in scoreBranch, not before): severity jumps
  // from D to B once C is overridden from 3 to 40, while L x F (and so
  // probability) is unaffected since only C was overridden.
  const unoverridden = scoreBranch(base, FIXTURE_YEAR);
  assert.equal(unoverridden.icao.cell, '4D');
  assert.equal(overridden.icao.cell, '4B');
});

test('setting only note/setBy with no numeric field does not count as an override', () => {
  const result = scoreBranch(
    { ...WORKED_EXAMPLES[1], overrides: { note: 'Reviewed, no change needed', setBy: 'J. Doe' } },
    FIXTURE_YEAR,
  );
  assert.equal(result.overridden, false, 'a note alone does not change any computed factor');
  assert.equal(result.riskScore, 36, 'score is unaffected');
});
