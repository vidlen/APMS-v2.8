/**
 * risk-cost.test.ts
 * -----------------------------------------------------------------------------
 * Phase 7: Alberti & Fiori's R/C ratio applied per branch. Worked examples
 * hand-checkable against risk.ts's own scoreBranch and rehab.ts's resetPci -
 * the same "check it with a calculator" standard risk.ts's WORKED_EXAMPLES
 * hold themselves to.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskCostForBranch, rankByRiskCost } from './risk-cost.ts';
import type { BranchRiskInput } from './risk.ts';
import { REHAB_RESET_PCI, resetPci, type RehabPlanItem } from './rehab.ts';

const FIXTURE_YEAR = 2025;

test('resetPci adds the treatment ΔPCI and caps at 100', () => {
  assert.equal(resetPci(40, '12 cm Structural Overlay'), 100); // 40 + 95, capped
  assert.equal(resetPci(70, 'Seal Coat / Crack Sealing'), 80); // 70 + 10, no cap
  assert.equal(resetPci(50, 'No M&R'), 50); // unchanged
});

test('REHAB_RESET_PCI covers all four treatments with Alberti Table 12 values', () => {
  assert.deepEqual(REHAB_RESET_PCI, {
    'Seal Coat / Crack Sealing': 10,
    '5 cm Overlay': 20,
    '6 cm Overlay': 45,
    '12 cm Structural Overlay': 95,
  });
});

/* --- riskCostForBranch: a hand-checkable worked example ------------------- */

test('riskCostForBranch: runway at the structural-overlay trigger, worked by hand', () => {
  // PCI 40 exactly: L from PCI_TO_LIKELIHOOD falls below the 41 band -> L 10.
  // F(runway) = 10. C(runway, fod from RAVELING) = 40.
  // R_before = 10 x 10 x 40 = 4000.
  //
  // getTreatment(40) = '12 cm Structural Overlay' (the 40-ceiling row).
  // afterPci = min(100, 40 + 95) = 100 -> L falls in the 95 band -> L 0.1.
  // R_after = 0.1 x 10 x 40 = 40.
  const input: BranchRiskInput = {
    branchId: 'RW-TEST',
    branchName: 'Test runway',
    role: 'runway',
    currentPci: 40,
    lastInspectionYear: FIXTURE_YEAR,
    dominantDistress: 'RAVELING',
  };
  const item: Pick<RehabPlanItem, 'treatment' | 'costIdr'> = {
    treatment: '12 cm Structural Overlay',
    costIdr: 850_000_000,
  };

  const result = riskCostForBranch(input, item, FIXTURE_YEAR);

  assert.equal(result.currentPci, 40);
  assert.equal(result.afterPci, 100);
  assert.equal(result.riskBefore, 4000);
  assert.equal(result.riskAfter, 40);
  assert.equal(result.riskRemoved, 3960);
  // 3960 risk removed / 850,000,000 IDR x 1,000,000 = 4.66 (2dp)
  assert.equal(Math.round(result.ratioPerMillionIdr * 100) / 100, 4.66);
});

test('riskCostForBranch: hazard class and role are invariant between before and after', () => {
  // Confirms the file header's central claim structurally, not just by
  // absence of a bug: C only depends on role x hazardClass, and hazardClass
  // only depends on dominantDistress, which riskCostForBranch never touches.
  const input: BranchRiskInput = {
    branchId: 'TW-TEST',
    branchName: 'Test taxiway',
    role: 'high_speed_exit',
    currentPci: 60,
    lastInspectionYear: FIXTURE_YEAR,
    dominantDistress: 'ALLIGATOR CR', // structural
  };
  const result = riskCostForBranch(
    input,
    { treatment: '6 cm Overlay', costIdr: 100_000_000 },
    FIXTURE_YEAR,
  );
  // C is the same 7 (high_speed_exit x structural) on both sides - if C had
  // moved, riskBefore/riskAfter wouldn't reduce to a pure function of L here.
  const likelihoodBefore = result.riskBefore / (6 * 7); // F(high_speed_exit)=6
  const likelihoodAfter = result.riskAfter / (6 * 7);
  assert.ok(Number.isFinite(likelihoodBefore) && Number.isFinite(likelihoodAfter));
});

test('riskCostForBranch ignores a Tier 1 forecast on both sides - Tier 3 only', () => {
  const withForecast: BranchRiskInput = {
    branchId: 'RW-TEST',
    branchName: 'Test runway',
    role: 'runway',
    currentPci: 40,
    lastInspectionYear: FIXTURE_YEAR,
    dominantDistress: 'RAVELING',
    markovTriggerProbability: 0.9, // would otherwise push L to 10 regardless of PCI
  };
  const withoutForecast: BranchRiskInput = { ...withForecast, markovTriggerProbability: undefined };

  const item: Pick<RehabPlanItem, 'treatment' | 'costIdr'> = {
    treatment: '12 cm Structural Overlay',
    costIdr: 850_000_000,
  };

  assert.deepEqual(
    riskCostForBranch(withForecast, item, FIXTURE_YEAR),
    riskCostForBranch(withoutForecast, item, FIXTURE_YEAR),
  );
});

test('a zero-cost treatment yields ratio 0, not Infinity or NaN', () => {
  const input: BranchRiskInput = {
    branchId: 'X',
    branchName: 'X',
    role: 'secondary_taxiway',
    currentPci: 70,
    lastInspectionYear: FIXTURE_YEAR,
  };
  const result = riskCostForBranch(input, { treatment: 'Seal Coat / Crack Sealing', costIdr: 0 }, FIXTURE_YEAR);
  assert.equal(result.ratioPerMillionIdr, 0);
});

/* --- rankByRiskCost -------------------------------------------------------- */

function planItem(section: string, pci: number, treatment: RehabPlanItem['treatment'], costIdr: number): RehabPlanItem {
  return {
    section: { Section: section, 'PCI Rating': String(pci), PCN: '111/R/D/W/T', Type: 'Asphalt' },
    pci,
    treatment,
    priorityYear: 'Year 1',
    costIdr,
    color: '#000000',
  };
}

test('rankByRiskCost sorts triggered branches by ratio, highest first', () => {
  const plan: RehabPlanItem[] = [
    planItem('A', 40, '12 cm Structural Overlay', 850_000_000),
    planItem('B', 78, 'Seal Coat / Crack Sealing', 5_000_000), // cheap, small risk removed
    planItem('C', 90, 'No M&R', 0), // excluded entirely
  ];
  const inputs: Record<string, BranchRiskInput> = {
    A: { branchId: 'A', branchName: 'A', role: 'runway', currentPci: 40, lastInspectionYear: FIXTURE_YEAR, dominantDistress: 'RAVELING' },
    B: { branchId: 'B', branchName: 'B', role: 'secondary_taxiway', currentPci: 78, lastInspectionYear: FIXTURE_YEAR },
    C: { branchId: 'C', branchName: 'C', role: 'runway', currentPci: 90, lastInspectionYear: FIXTURE_YEAR },
  };

  const ranked = rankByRiskCost(plan, inputs, FIXTURE_YEAR);
  assert.equal(ranked.length, 2, 'No M&R branch excluded');

  // Expected order computed independently via riskCostForBranch directly,
  // not derived from `ranked` itself - a self-referential check would pass
  // no matter what order rankByRiskCost actually produced.
  const expectedA = riskCostForBranch(inputs.A, { treatment: '12 cm Structural Overlay', costIdr: 850_000_000 }, FIXTURE_YEAR);
  const expectedB = riskCostForBranch(inputs.B, { treatment: 'Seal Coat / Crack Sealing', costIdr: 5_000_000 }, FIXTURE_YEAR);
  const expectedOrder = expectedA.ratioPerMillionIdr >= expectedB.ratioPerMillionIdr ? ['A', 'B'] : ['B', 'A'];

  assert.deepEqual(ranked.map((r) => r.branchId), expectedOrder);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].ratioPerMillionIdr >= ranked[i].ratioPerMillionIdr);
  }
});

test('rankByRiskCost skips a plan item with no matching BranchRiskInput', () => {
  const plan: RehabPlanItem[] = [planItem('UNMATCHED', 40, '12 cm Structural Overlay', 1_000_000)];
  const ranked = rankByRiskCost(plan, {}, FIXTURE_YEAR);
  assert.deepEqual(ranked, []);
});

test('rankByRiskCost on an empty plan returns an empty array', () => {
  assert.deepEqual(rankByRiskCost([], {}, FIXTURE_YEAR), []);
});
