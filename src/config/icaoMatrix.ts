/**
 * icaoMatrix.ts
 * -----------------------------------------------------------------------------
 * ICAO Doc 9859 (4th ed.) 5x5 safety risk matrix - the VERDICT layer.
 *
 * Fine-Kinney (riskScales.ts) stays the scoring engine: it produces L, F, C and
 * an ordinal R that ranks the 75 branches. But R is unbounded, and Kinney's
 * degree labels saturate on high-consequence, high-exposure assets - see the
 * comment above RISK_BANDS in riskScales.ts for the runway-at-PCI-79 case.
 *
 * This file is the fix: a bounded 25-cell grid with no arithmetic in it, so it
 * cannot saturate. `icao.ts` reads L, F and C and looks up a cell here; that
 * cell's zone is the operational verdict, and the Fine-Kinney degree becomes a
 * comparison column only (locked decision 3, brief section 5).
 *
 * CITATION CHAIN (for the thesis): ISO 31000 -> IEC 31010 section B.10.3 ->
 * ICAO Doc 9859 4th ed. -> Seven & Yardim (2024) APIRM.
 * -----------------------------------------------------------------------------
 */

/**
 * Probability axis, driven by L x F rather than L alone.
 *
 * Fine-Kinney has three axes (L, F, C) and ICAO has two (probability,
 * severity). The axis that disappears in the collapse is Frequency - and
 * Frequency is what carries the whole operational difference between a
 * runway and a remote apron. Folding it into probability as L x F is how that
 * difference survives into the bounded matrix (locked decision 5).
 *
 * `minLF: 10` is the main calibration lever in this file: move it if Angkasa
 * Pura's own SMS grid disagrees. Read first-match, highest threshold first.
 */
export const LF_TO_ICAO_PROBABILITY = [
  { minLF: 30, probability: 5, label: 'Frequent' },
  { minLF: 10, probability: 4, label: 'Occasional' },
  { minLF: 3, probability: 3, label: 'Remote' },
  { minLF: 0.5, probability: 2, label: 'Improbable' },
  { minLF: 0, probability: 1, label: 'Extremely improbable' },
] as const;

/**
 * Severity axis, from the Fine-Kinney consequence value C.
 *
 * The two scales use different words for adjacent bands - notably Kinney's
 * C=7 ("Serious") lands on ICAO severity D ("Minor"), not C ("Major"). That is
 * intentional, not a typo: it is what produces the verified `5D` cell for an
 * active apron at low PCI (Tolerable, not Intolerable), because an apron
 * failure has no direct catastrophic pathway the way a runway failure does.
 */
export const C_TO_ICAO_SEVERITY = [
  { minC: 100, severity: 'A', label: 'Catastrophic' },
  { minC: 40, severity: 'B', label: 'Hazardous' },
  { minC: 15, severity: 'C', label: 'Major' },
  { minC: 3, severity: 'D', label: 'Minor' },
  { minC: 0, severity: 'E', label: 'Negligible' },
] as const;

/**
 * Doc 9859 4th ed. reference example grid. REPLACE with Angkasa Pura's own
 * SMS 5x5 grid and severity definitions once obtained (locked decision 8,
 * brief section 7 blocker 4). Until then, ICAO_GRID_PROVENANCE below must be
 * shown in the UI so the grid is never mistaken for the airport's own.
 */
export const INTOLERABLE_CELLS = ['5A', '5B', '5C', '4A', '4B', '3A'];
export const ACCEPTABLE_CELLS = ['3E', '2D', '2E', '1B', '1C', '1D', '1E'];
// Everything else (cell not in either list above): Tolerable (ALARP).

export type IcaoZoneName = 'Intolerable' | 'Tolerable' | 'Acceptable';

/**
 * Per-zone colour and recommended action. Colours match RISK_BANDS' green /
 * amber / red so the ICAO ramp and the Fine-Kinney ramp share one palette
 * (brief section 9 item F: ICAO zone ramp is the map default, Fine-Kinney
 * five-band ramp sits behind a toggle).
 *
 * The Intolerable action reads "reduce the risk", never "cease operation" or
 * "close the runway". Writing it as cessation would recreate the exact defect
 * this file exists to fix (see riskScales.ts) and violate the definition of
 * done: no branch in Satisfactory condition or better may receive an
 * operational instruction to discontinue use (brief section 12).
 */
export const ICAO_ZONES: Record<
  IcaoZoneName,
  { color: string; action: string }
> = {
  Intolerable: {
    color: '#dc2626',
    action: 'Reduce the risk: mitigate to Tolerable before the next programmed cycle',
  },
  Tolerable: {
    color: '#facc15',
    action: 'Acceptable with mitigation (ALARP): schedule corrective works',
  },
  Acceptable: {
    color: '#16a34a',
    action: 'Acceptable as is: routine monitoring',
  },
};

/** Shown in the UI wherever the matrix or its zones are rendered. */
export const ICAO_GRID_PROVENANCE =
  'Doc 9859 4th ed. reference example grid - provisional pending Angkasa Pura\'s own SMS 5x5 grid and severity definitions.';
