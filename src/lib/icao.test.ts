/**
 * icao.test.ts
 * -----------------------------------------------------------------------------
 * risk.test.ts already exercises assessIcao indirectly through 8 sampled
 * PCI/role combinations (§6 verified crosswalk). This file completes the
 * picture: zoneFor is checked against all 25 cells of the 5x5 grid, matching
 * INTOLERABLE_CELLS/ACCEPTABLE_CELLS verbatim from the brief (§6) - the
 * matrix panel (backlog H) shades every cell, including ones no branch
 * currently occupies, so every cell's zone needs to be right, not just the
 * ones a sampled branch happens to land on.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, assessIcao } from './icao.ts';

const PROBABILITIES = [1, 2, 3, 4, 5];
const SEVERITIES = ['A', 'B', 'C', 'D', 'E'];

// Copied from the brief §6 code block, not re-derived from INTOLERABLE_CELLS/
// ACCEPTABLE_CELLS - if icaoMatrix.ts ever drifts from the brief's reference
// grid, this test should fail, not agree with the drift.
const EXPECTED_INTOLERABLE = new Set(['5A', '5B', '5C', '4A', '4B', '3A']);
const EXPECTED_ACCEPTABLE = new Set(['3E', '2D', '2E', '1B', '1C', '1D', '1E']);

test('zoneFor classifies all 25 cells exactly as the brief\'s reference grid', () => {
  for (const p of PROBABILITIES) {
    for (const s of SEVERITIES) {
      const cell = `${p}${s}`;
      const expected = EXPECTED_INTOLERABLE.has(cell)
        ? 'Intolerable'
        : EXPECTED_ACCEPTABLE.has(cell)
          ? 'Acceptable'
          : 'Tolerable';
      assert.equal(zoneFor(cell), expected, `cell ${cell}`);
    }
  }
});

test('assessIcao cell string is always probability digit + severity letter', () => {
  // A mid-range L/F/C that doesn't sit exactly on a band edge, as a sanity
  // check on the cell format itself (independent of which band it lands in).
  const result = assessIcao(3, 3, 15);
  assert.match(result.cell, /^[1-5][A-E]$/);
  assert.equal(result.cell, `${result.probability}${result.severity}`);
});
