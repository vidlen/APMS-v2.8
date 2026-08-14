/**
 * icao.ts
 * -----------------------------------------------------------------------------
 * ICAO Doc 9859 5x5 crosswalk. Takes the three Fine-Kinney factors and returns
 * the operational verdict: which cell the branch occupies and which of the
 * three tolerability zones that cell falls in.
 *
 * Deliberately takes primitives (likelihood, frequency, consequence) rather
 * than a BranchRiskResult: risk.ts imports this module to compute every
 * result's `icao` field, so accepting a BranchRiskResult here would create a
 * circular import. Primitives also make this testable on its own, without
 * constructing a whole branch.
 * -----------------------------------------------------------------------------
 */

import {
  C_TO_ICAO_SEVERITY,
  ICAO_ZONES,
  INTOLERABLE_CELLS,
  ACCEPTABLE_CELLS,
  LF_TO_ICAO_PROBABILITY,
  type IcaoZoneName,
} from '../config/icaoMatrix.ts';

export interface IcaoAssessment {
  probability: 1 | 2 | 3 | 4 | 5;
  probabilityLabel: string;
  severity: 'A' | 'B' | 'C' | 'D' | 'E';
  severityLabel: string;
  /** e.g. '4B' - probability digit followed by severity letter. */
  cell: string;
  zone: IcaoZoneName;
  zoneColor: string;
  zoneAction: string;
}

function probabilityFor(lf: number) {
  for (const band of LF_TO_ICAO_PROBABILITY) {
    if (lf >= band.minLF) return band;
  }
  return LF_TO_ICAO_PROBABILITY[LF_TO_ICAO_PROBABILITY.length - 1];
}

function severityFor(consequence: number) {
  for (const band of C_TO_ICAO_SEVERITY) {
    if (consequence >= band.minC) return band;
  }
  return C_TO_ICAO_SEVERITY[C_TO_ICAO_SEVERITY.length - 1];
}

/**
 * Exported (not just used internally by assessIcao) so the matrix panel
 * (backlog H) can shade all 25 cells - including ones no branch currently
 * occupies - from the same single source of truth, rather than a second
 * copy of this membership check drifting out of sync with it.
 */
export function zoneFor(cell: string): IcaoZoneName {
  if (INTOLERABLE_CELLS.includes(cell)) return 'Intolerable';
  if (ACCEPTABLE_CELLS.includes(cell)) return 'Acceptable';
  return 'Tolerable';
}

export function assessIcao(
  likelihood: number,
  frequency: number,
  consequence: number,
): IcaoAssessment {
  const lf = likelihood * frequency;
  const probabilityBand = probabilityFor(lf);
  const severityBand = severityFor(consequence);
  const cell = `${probabilityBand.probability}${severityBand.severity}`;
  const zone = zoneFor(cell);
  const zoneInfo = ICAO_ZONES[zone];

  return {
    probability: probabilityBand.probability,
    probabilityLabel: probabilityBand.label,
    severity: severityBand.severity,
    severityLabel: severityBand.label,
    cell,
    zone,
    zoneColor: zoneInfo.color,
    zoneAction: zoneInfo.action,
  };
}
