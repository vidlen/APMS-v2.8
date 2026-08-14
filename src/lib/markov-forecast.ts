/**
 * markov-forecast.ts
 * -----------------------------------------------------------------------------
 * Backlog M / brief section 11: the data contract for Teammate A's Markov
 * chain forecast. This file is the ACCEPTANCE MECHANISM only - scoreBranch
 * has resolved Tier 1 (markovTriggerProbability) ahead of Tier 2/3 since the
 * original draft (risk.ts). What was missing was a way to get Teammate A's
 * JSON into a BranchRiskInput at all. Nothing here blocks on their delivery:
 * Admin -> Tier 1 Forecast accepts the file whenever it arrives, and every
 * branch without a matching entry keeps scoring on Tier 3 exactly as before
 * (see risk-adapter.ts).
 *
 * Contract (brief section 11), unchanged from what was agreed with Teammate A:
 *   [{ branchId, horizonYears, triggerPci, markovTriggerProbability }]
 * markovTriggerProbability = P(branch reaches PCI <= triggerPci within
 * horizonYears), from the cumulative Markov state distribution.
 * -----------------------------------------------------------------------------
 */

export interface MarkovForecastEntry {
  branchId: string;
  horizonYears: number;
  triggerPci: number;
  markovTriggerProbability: number;
}

export type MarkovForecastValidationResult =
  | { ok: true; data: MarkovForecastEntry[] }
  | { ok: false; error: string };

// A file from another person's script is a trust boundary - validate every
// field rather than assuming Teammate A's export matches the contract byte
// for byte. A malformed entry fails the whole import (not a partial one) so
// a bad row can't silently drop one branch back to Tier 3 unnoticed.
export function validateMarkovForecast(json: unknown): MarkovForecastValidationResult {
  if (!Array.isArray(json)) {
    return { ok: false, error: 'Expected a JSON array of forecast entries.' };
  }

  const entries: MarkovForecastEntry[] = [];
  for (let i = 0; i < json.length; i++) {
    const row = json[i];
    if (typeof row !== 'object' || row === null) {
      return { ok: false, error: `Entry ${i}: not an object.` };
    }
    const r = row as Record<string, unknown>;

    if (typeof r.branchId !== 'string' || !r.branchId.trim()) {
      return { ok: false, error: `Entry ${i}: "branchId" must be a non-empty string.` };
    }
    if (
      typeof r.markovTriggerProbability !== 'number' ||
      r.markovTriggerProbability < 0 ||
      r.markovTriggerProbability > 1
    ) {
      return {
        ok: false,
        error: `Entry ${i} (${r.branchId}): "markovTriggerProbability" must be a number between 0 and 1.`,
      };
    }
    if (typeof r.horizonYears !== 'number' || r.horizonYears <= 0) {
      return { ok: false, error: `Entry ${i} (${r.branchId}): "horizonYears" must be a positive number.` };
    }
    if (typeof r.triggerPci !== 'number' || r.triggerPci < 0 || r.triggerPci > 100) {
      return { ok: false, error: `Entry ${i} (${r.branchId}): "triggerPci" must be a number between 0 and 100.` };
    }

    entries.push({
      branchId: r.branchId,
      horizonYears: r.horizonYears,
      triggerPci: r.triggerPci,
      markovTriggerProbability: r.markovTriggerProbability,
    });
  }

  return { ok: true, data: entries };
}

export async function parseMarkovForecastFile(file: File): Promise<MarkovForecastValidationResult> {
  try {
    const text = await file.text();
    return validateMarkovForecast(JSON.parse(text));
  } catch {
    return { ok: false, error: 'Could not parse file as JSON.' };
  }
}

/** branchId -> entry, for O(1) lookup when merging into BranchRiskInput (risk-adapter.ts). */
export function keyMarkovForecastByBranch(
  entries: MarkovForecastEntry[],
): Record<string, MarkovForecastEntry> {
  const map: Record<string, MarkovForecastEntry> = {};
  for (const e of entries) map[e.branchId] = e;
  return map;
}

/** The one worked example from brief section 11, for the "download template" button. */
export const MARKOV_FORECAST_TEMPLATE: MarkovForecastEntry[] = [
  { branchId: 'RW-0624-C', horizonYears: 5, triggerPci: 80, markovTriggerProbability: 0.34 },
];
