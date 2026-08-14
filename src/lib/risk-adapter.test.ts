/**
 * risk-adapter.test.ts
 * -----------------------------------------------------------------------------
 * Pins roleFromSectionName's boundary cases against SHIA's real branch codes
 * (from public/data/pavement-data.json) - the heuristic is a plain lookup
 * table's worth of regex, but it is the one piece of non-obvious branching
 * logic in risk-adapter.ts, so it gets a check. Also pins inferredRoleFor /
 * inferredDominantDistressFor against the reviewed inventory (KNOWN_ROLES /
 * KNOWN_DOMINANT_DISTRESS) layered on top of that heuristic, including its
 * one deliberate exception (S8) that a smarter regex would have missed.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleFromSectionName, inferredRoleFor, inferredDominantDistressFor, toBranchRiskInputs } from './risk-adapter.ts';
import type { SectionData } from './pci-utils.ts';

test('roleFromSectionName classifies every branch code shape', () => {
  // Runways: two-digit heading, optional L/C/R suffix.
  assert.equal(roleFromSectionName('06/24'), 'runway');
  assert.equal(roleFromSectionName('07L/25R'), 'runway');
  assert.equal(roleFromSectionName('07R/25L'), 'runway');

  // Full-length parallel taxiways: NP/SP followed by a digit.
  assert.equal(roleFromSectionName('NP1'), 'parallel_taxiway');
  assert.equal(roleFromSectionName('SP2'), 'parallel_taxiway');

  // NPE/NPW/SPE/SPW are short connectors, not the ~3.7km parallel taxiways -
  // NP/SP followed by a letter must NOT match the parallel pattern.
  assert.equal(roleFromSectionName('NPE'), 'secondary_taxiway');
  assert.equal(roleFromSectionName('SPW'), 'secondary_taxiway');

  // Aprons and remote aprons.
  assert.equal(roleFromSectionName('Apron A'), 'active_apron');
  assert.equal(roleFromSectionName('Remote Apron B'), 'remote_apron');

  // Ordinary connector/exit taxiways fall back to secondary_taxiway.
  assert.equal(roleFromSectionName('N3'), 'secondary_taxiway');
  assert.equal(roleFromSectionName('SC4'), 'secondary_taxiway');
});

test('inferredRoleFor prefers the reviewed inventory over the naming heuristic for a real branch', () => {
  // N3 is a bare N-code the heuristic alone would default to
  // secondary_taxiway, but the reviewed inventory (Risk Inventory_Admin.xlsx)
  // classifies it as a high-speed exit taxiway.
  assert.equal(inferredRoleFor('N3'), 'high_speed_exit');
  assert.equal(roleFromSectionName('N3'), 'secondary_taxiway', 'the raw heuristic is unchanged');
});

test('inferredRoleFor keeps the inventory\'s deliberate exception, not the pattern it looks like', () => {
  // S8 is the one bare S-code the inventory does NOT classify as a
  // high-speed exit, unlike every other S1-S9/M1-M8/N1-N9 code - proof this
  // is a reviewed assignment, not a smarter regex over the same codes.
  assert.equal(inferredRoleFor('S8'), 'secondary_taxiway');
});

test('inferredRoleFor falls back to the heuristic for a branch the inventory does not cover', () => {
  assert.equal(inferredRoleFor('ZZ9'), 'secondary_taxiway');
});

test('inferredDominantDistressFor returns the reviewed distress for the 2 of 75 branches that have one', () => {
  assert.equal(inferredDominantDistressFor('06/24'), 'RAVELING');
  assert.equal(inferredDominantDistressFor('07L/25R'), 'L & T CR');
  assert.equal(inferredDominantDistressFor('N3'), undefined, 'no distress recorded for this branch');
});

test('toBranchRiskInputs picks up the reviewed role and distress for a real branch with no admin override', () => {
  const runway: SectionData = { Section: '06/24', 'PCI Rating': '70', PCN: '111/R/D/W/T', Type: 'Asphalt' };
  const [input] = toBranchRiskInputs([runway], '2025');
  assert.equal(input.role, 'runway');
  assert.equal(input.dominantDistress, 'RAVELING');
});

// A synthetic code, deliberately not one of the 75 real branches in
// KNOWN_ROLES (risk-adapter.ts) - these tests exercise the no-known-role,
// no-override fallback path, which a real (now-inventoried) code would no
// longer hit.
const SECTION: SectionData = {
  Section: 'ZZ9',
  'PCI Rating': '82',
  PCN: '111/R/D/W/T',
  Type: 'Asphalt',
};

test('toBranchRiskInputs falls back to the heuristic and the survey year when no override is set', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024');
  assert.equal(input.role, 'secondary_taxiway', 'heuristic default for an unlisted code');
  assert.equal(input.lastInspectionYear, 2024, 'survey year, no admin override');
  assert.equal(input.dominantDistress, undefined);
});

test('toBranchRiskInputs prefers an admin-entered override over the heuristic default', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', {
    ZZ9: { role: 'runway', lastInspectionYear: 2019, dominantDistress: 'RAVELING', detectability: 'hidden' },
  });
  assert.equal(input.role, 'runway', 'explicit override wins over roleFromSectionName');
  assert.equal(input.lastInspectionYear, 2019, 'explicit override wins over the survey year');
  assert.equal(input.dominantDistress, 'RAVELING');
  assert.equal(input.detectability, 'hidden', 'detectability override reaches the risk engine input');
});

test('toBranchRiskInputs applies a partial override field-by-field, not all-or-nothing', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', {
    ZZ9: { dominantDistress: 'ALLIGATOR CR' },
  });
  assert.equal(input.role, 'secondary_taxiway', 'role still falls back to the heuristic');
  assert.equal(input.lastInspectionYear, 2024, 'lastInspectionYear still falls back to the survey year');
  assert.equal(input.dominantDistress, 'ALLIGATOR CR', 'only the overridden field changes');
});

test('toBranchRiskInputs threads lfcOverride through as BranchRiskInput.overrides (backlog L)', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', {
    ZZ9: { lfcOverride: { likelihood: 10, note: 'Expert panel', setBy: 'J. Doe', setOn: '2026-01-15' } },
  });
  assert.deepEqual(input.overrides, {
    likelihood: 10,
    note: 'Expert panel',
    setBy: 'J. Doe',
    setOn: '2026-01-15',
  });
});

test('toBranchRiskInputs leaves overrides undefined when no lfcOverride is set', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', { ZZ9: { role: 'runway' } });
  assert.equal(input.overrides, undefined);
});

test('toBranchRiskInputs sets markovTriggerProbability for a branch Teammate A\'s forecast covers (backlog M)', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', {}, {
    ZZ9: { branchId: 'ZZ9', horizonYears: 5, triggerPci: 80, markovTriggerProbability: 0.34 },
  });
  assert.equal(input.markovTriggerProbability, 0.34);
});

test('toBranchRiskInputs leaves markovTriggerProbability undefined for a branch the forecast does not cover', () => {
  const [input] = toBranchRiskInputs([SECTION], '2024', {}, {
    'some-other-branch': { branchId: 'some-other-branch', horizonYears: 5, triggerPci: 80, markovTriggerProbability: 0.34 },
  });
  assert.equal(input.markovTriggerProbability, undefined, 'falls back to Tier 2/3, exactly as before this branch had a forecast');
});
