/**
 * markov-forecast.test.ts
 * -----------------------------------------------------------------------------
 * validateMarkovForecast is the trust boundary for a file written by someone
 * else's script (Teammate A's Markov chain export), so its branching gets a
 * check the way any other file-format validator in this repo would.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMarkovForecast,
  keyMarkovForecastByBranch,
  MARKOV_FORECAST_TEMPLATE,
} from './markov-forecast.ts';

test('validateMarkovForecast accepts the brief section 11 worked example verbatim', () => {
  const result = validateMarkovForecast(MARKOV_FORECAST_TEMPLATE);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, MARKOV_FORECAST_TEMPLATE);
  }
});

test('validateMarkovForecast rejects a non-array payload', () => {
  const result = validateMarkovForecast({ branchId: 'RW-0624-C' });
  assert.equal(result.ok, false);
});

test('validateMarkovForecast rejects a probability outside [0, 1]', () => {
  const result = validateMarkovForecast([
    { branchId: 'RW-0624-C', horizonYears: 5, triggerPci: 80, markovTriggerProbability: 1.2 },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /markovTriggerProbability/);
});

test('validateMarkovForecast rejects a missing branchId', () => {
  const result = validateMarkovForecast([
    { horizonYears: 5, triggerPci: 80, markovTriggerProbability: 0.34 },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /branchId/);
});

test('validateMarkovForecast rejects a triggerPci outside [0, 100]', () => {
  const result = validateMarkovForecast([
    { branchId: 'RW-0624-C', horizonYears: 5, triggerPci: 150, markovTriggerProbability: 0.34 },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /triggerPci/);
});

test('validateMarkovForecast fails the whole import on one bad row, not just that row', () => {
  const result = validateMarkovForecast([
    { branchId: 'RW-0624-C', horizonYears: 5, triggerPci: 80, markovTriggerProbability: 0.34 },
    { branchId: 'AP-REMOTE-04', horizonYears: 5, triggerPci: 80, markovTriggerProbability: -0.1 },
  ]);
  assert.equal(result.ok, false, 'a malformed second entry must not silently drop only itself');
});

test('keyMarkovForecastByBranch indexes entries by branchId', () => {
  const map = keyMarkovForecastByBranch(MARKOV_FORECAST_TEMPLATE);
  assert.equal(map['RW-0624-C']?.markovTriggerProbability, 0.34);
  assert.equal(map['unknown-branch'], undefined);
});
