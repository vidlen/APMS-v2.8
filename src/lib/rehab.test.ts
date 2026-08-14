/**
 * rehab.test.ts
 * -----------------------------------------------------------------------------
 * computeRehabPlan is the one non-obvious piece of logic in rehab.ts: the
 * four-case-study PCI threshold table (REHAB_METHODOLOGY) that decides a
 * branch's treatment, the worst-PCI-first bucketing of triggered branches
 * across a 5-year window, the dummy cost estimate that scales with treatment
 * and section area, and the admin override layer (Admin -> Rehabilitation
 * Plan) on top of all three. A silently-wrong boundary, bucket count, or
 * override precedence would misinform the Rehabilitation Plan tab's map
 * colors, register, and funds total without ever throwing.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRehabPlan, REHAB_TRIGGER_PCI } from './rehab.ts';
import type { SectionData } from './pci-utils.ts';
import type { SectionRehabOverride } from './data-overrides.ts';

function section(overrides: Partial<SectionData> & { Section: string; "PCI Rating": string }): SectionData {
  return { PCN: '80/F/A/X/T', Type: 'Asphalt', ...overrides };
}

test('a branch above the trigger PCI gets No M&R and is Not Scheduled', () => {
  const plan = computeRehabPlan([section({ Section: 'A1', 'PCI Rating': String(REHAB_TRIGGER_PCI + 1) })]);
  assert.equal(plan[0].treatment, 'No M&R');
  assert.equal(plan[0].priorityYear, 'Not Scheduled');
});

test('each of the four case-study thresholds selects its own treatment at the boundary', () => {
  const plan = computeRehabPlan([
    section({ Section: 'SEAL', 'PCI Rating': '80' }), // <= 80
    section({ Section: 'OV5', 'PCI Rating': '65' }), // <= 65
    section({ Section: 'OV6', 'PCI Rating': '53' }), // <= 53
    section({ Section: 'OV12', 'PCI Rating': '40' }), // <= 40
  ]);
  assert.equal(plan.find((p) => p.section.Section === 'SEAL')?.treatment, 'Seal Coat / Crack Sealing');
  assert.equal(plan.find((p) => p.section.Section === 'OV5')?.treatment, '5 cm Overlay');
  assert.equal(plan.find((p) => p.section.Section === 'OV6')?.treatment, '6 cm Overlay');
  assert.equal(plan.find((p) => p.section.Section === 'OV12')?.treatment, '12 cm Structural Overlay');
});

test('a PCI just above a threshold falls into the lighter treatment, not the heavier one', () => {
  const plan = computeRehabPlan([
    section({ Section: 'JUST_ABOVE_65', 'PCI Rating': '66' }),
    section({ Section: 'JUST_ABOVE_53', 'PCI Rating': '54' }),
    section({ Section: 'JUST_ABOVE_40', 'PCI Rating': '41' }),
  ]);
  assert.equal(plan.find((p) => p.section.Section === 'JUST_ABOVE_65')?.treatment, 'Seal Coat / Crack Sealing');
  assert.equal(plan.find((p) => p.section.Section === 'JUST_ABOVE_53')?.treatment, '5 cm Overlay');
  assert.equal(plan.find((p) => p.section.Section === 'JUST_ABOVE_40')?.treatment, '6 cm Overlay');
});

test('triggered branches are bucketed worst-PCI-first across exactly 5 years', () => {
  // 10 triggered branches, evenly spread PCI so ordering is unambiguous.
  const sections = Array.from({ length: 10 }, (_, i) =>
    section({ Section: `B${i}`, 'PCI Rating': String(10 + i * 5) })
  );
  const plan = computeRehabPlan(sections);
  const byPci = plan.slice().sort((a, b) => a.pci - b.pci);
  assert.equal(byPci[0].priorityYear, 'Year 1', 'worst PCI must land in Year 1');
  assert.equal(byPci[9].priorityYear, 'Year 5', 'best-of-the-triggered PCI must land in Year 5');
  for (const year of ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5']) {
    assert.equal(plan.filter((p) => p.priorityYear === year).length, 2, `${year} should get 2 of 10`);
  }
});

test('sample-unit rows are excluded from the branch-level plan', () => {
  const plan = computeRehabPlan([
    section({ Section: 'X1', 'PCI Rating': '50' }),
    section({ Section: 'X1', 'PCI Rating': '40', sampleUnit: 3 }),
  ]);
  assert.equal(plan.length, 1);
});

test('a No M&R branch always costs 0, regardless of dimension', () => {
  const plan = computeRehabPlan([
    section({ Section: 'OK', 'PCI Rating': '90', Dimension: '3660 x 60 m' }),
  ]);
  assert.equal(plan[0].costIdr, 0);
});

test('the dummy cost estimate scales with section area, not a flat per-treatment number', () => {
  const plan = computeRehabPlan([
    section({ Section: 'BIG', 'PCI Rating': '35', Dimension: '2000 x 60 m' }), // 12cm overlay, 120,000 m²
    section({ Section: 'SMALL', 'PCI Rating': '35', Dimension: '100 x 20 m' }), // 12cm overlay, 2,000 m²
  ]);
  const big = plan.find((p) => p.section.Section === 'BIG')!;
  const small = plan.find((p) => p.section.Section === 'SMALL')!;
  assert.equal(big.treatment, small.treatment, 'same treatment band');
  assert.ok(big.costIdr > small.costIdr, 'the larger section must cost more');
  assert.equal(big.costIdr / small.costIdr, 60, 'cost scales linearly with area (120,000 / 2,000)');
});

test('an unparsable Dimension still gets a nonzero cost, not silently zero', () => {
  const plan = computeRehabPlan([section({ Section: 'NODIM', 'PCI Rating': '35' })]);
  assert.ok(plan[0].costIdr > 0);
});

test('an admin override replaces treatment, priority year, and cost for that branch only', () => {
  const overrides: Record<string, SectionRehabOverride> = {
    A1: { treatment: '12 cm Structural Overlay', priorityYear: 'Year 1', costIdr: 999 },
  };
  const plan = computeRehabPlan(
    [
      section({ Section: 'A1', 'PCI Rating': '90' }), // would otherwise be No M&R / Not Scheduled
      section({ Section: 'A2', 'PCI Rating': '90' }),
    ],
    overrides,
  );
  const a1 = plan.find((p) => p.section.Section === 'A1')!;
  const a2 = plan.find((p) => p.section.Section === 'A2')!;
  assert.equal(a1.treatment, '12 cm Structural Overlay');
  assert.equal(a1.priorityYear, 'Year 1');
  assert.equal(a1.costIdr, 999);
  assert.equal(a2.treatment, 'No M&R', 'overriding A1 must not affect A2');
  assert.equal(a2.priorityYear, 'Not Scheduled');
});

test('overriding one branch does not reshuffle the auto-computed years of the others', () => {
  const sections = Array.from({ length: 10 }, (_, i) =>
    section({ Section: `B${i}`, 'PCI Rating': String(10 + i * 5) })
  );
  const withoutOverride = computeRehabPlan(sections);
  const withOverride = computeRehabPlan(sections, { B0: { priorityYear: 'Year 5' } });
  const untouched = withoutOverride.filter((p) => p.section.Section !== 'B0');
  const untouchedAfter = withOverride.filter((p) => p.section.Section !== 'B0');
  assert.deepEqual(
    untouchedAfter.map((p) => p.priorityYear),
    untouched.map((p) => p.priorityYear),
  );
  assert.equal(withOverride.find((p) => p.section.Section === 'B0')?.priorityYear, 'Year 5');
});

test('overriding only the treatment recomputes the dummy cost for the new treatment, not the stale one', () => {
  const plan = computeRehabPlan(
    [section({ Section: 'A1', 'PCI Rating': '90', Dimension: '100 x 20 m' })],
    { A1: { treatment: '12 cm Structural Overlay' } },
  );
  assert.ok(plan[0].costIdr > 0, 'cost must reflect the overridden treatment, not the original No M&R (0)');
});
