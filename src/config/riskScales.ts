/**
 * riskScales.ts
 * -----------------------------------------------------------------------------
 * Fine-Kinney calibration for the SHIA Airport Pavement Management System.
 *
 * Every number in this file is a MODELLING DECISION, not a computed result.
 * This is the file an examiner should be able to read end to end and challenge.
 * Keep it flat, keep it commented, and cite the source of each scale.
 *
 * PRIMARY SOURCES
 *  [1] Kinney, G.F. & Wiruth, A.D. (1976). Practical Risk Analysis for Safety
 *      Management. Naval Weapons Center, China Lake, CA.
 *  [2] Seven, E. & Yardim, M.S. (2024). An Integrated Risk Management Model for
 *      Performance Assessment of Airport Pavements: The Case of Istanbul
 *      Airport. Applied Sciences 14(24), 12034. (APIRM model)
 *  [3] ICAO Annex 14, Vol. I - Aerodrome Design and Operations (SMS requirement)
 *  [4] ASTM D5340 - Standard Test Method for Airport Pavement Condition Index
 *
 * DEVIATION FROM [2] (state this in your methodology chapter):
 *   Seven & Yardim obtain Likelihood from a survey of six Istanbul Airport
 *   experts and take the modal response. This implementation derives Likelihood
 *   from the Markov condition forecast instead, so the score recomputes when a
 *   new survey year is loaded. Frequency and Consequence remain rule-based,
 *   because both depend on operational role rather than pavement condition.
 * -----------------------------------------------------------------------------
 */

/* =============================================================================
 * 1. FINE-KINNEY BASE SCALES  (source [1], reproduced in [2] Tables 5-6)
 * ========================================================================== */

/** Likelihood of the hazardous event occurring. Seven discrete levels. */
export const LIKELIHOOD_SCALE = [
  { value: 0.1, label: 'Virtually impossible' },
  { value: 0.2, label: 'Practically impossible' },
  { value: 0.5, label: 'Conceivable but very unlikely' },
  { value: 1, label: 'Only remotely possible' },
  { value: 3, label: 'Unusual but possible' },
  { value: 6, label: 'Quite possible' },
  { value: 10, label: 'Might well be expected' },
] as const;

/** Exposure frequency: how often personnel or aircraft meet the hazard. */
export const FREQUENCY_SCALE = [
  { value: 0.5, label: 'Very rare (once a year)' },
  { value: 1, label: 'Rare (a few times per year)' },
  { value: 2, label: 'Unusual (monthly)' },
  { value: 3, label: 'Occasional (weekly)' },
  { value: 6, label: 'Frequent (daily)' },
  { value: 10, label: 'Continuous (hourly)' },
] as const;

/** Worst credible consequence. USD figures are from [1]/[2], unadjusted. */
export const CONSEQUENCE_SCALE = [
  { value: 1, label: 'Noticeable (minor first aid, or > USD 100)' },
  { value: 3, label: 'Important (disability, or > USD 1,000)' },
  { value: 7, label: 'Serious (serious injury, or > USD 10,000)' },
  { value: 15, label: 'Very serious (fatality, or > USD 100,000)' },
  { value: 40, label: 'Disaster (few fatalities, or > USD 1,000,000)' },
  { value: 100, label: 'Catastrophe (many fatalities, or > USD 10,000,000)' },
] as const;

/**
 * The seven likelihood levels as a plain number array, used by
 * `escalateLikelihood` to step a value up the scale.
 *
 * The `: number[]` annotation is load-bearing. Without it, `as const` above
 * makes this a union of literal types (0.1 | 0.2 | ... | 10), and TypeScript
 * then rejects `LIKELIHOOD_VALUES.indexOf(someNumber)` because a plain `number`
 * is not assignable to that union.
 */
export const LIKELIHOOD_VALUES: number[] = LIKELIHOOD_SCALE.map((s) => s.value);

/* =============================================================================
 * 2. RISK BANDS  (source [2] Table 6)
 *
 * The published table uses open inequalities (R < 20, 20 < R < 70, ...) and so
 * leaves the boundary values 20, 70, 200 and 400 undefined. Resolved here with
 * inclusive lower bounds. Document this resolution in your thesis.
 *
 * ---------------------------------------------------------------------------
 * THESE DEGREES ARE A COMPARISON COLUMN, NOT THE OPERATIONAL VERDICT.
 *
 * R = L x F x C is unbounded, so on a high-consequence high-exposure asset it
 * saturates: a runway (F 10, C 40) in ASTM "Satisfactory" condition at PCI 79
 * scores 1 x 10 x 40 = 400 and reaches degree 5, whose published label reads
 * "consider discontinuing operation". The ranking is still correct; the label
 * is not, and a dashboard that recommends closing a live runway at PCI 79
 * discredits every other screen.
 *
 * The fix is not to re-tune these bands. `R` keeps its job of ORDERING the 75
 * branches. Tolerability is decided by the bounded ICAO Doc 9859 5x5 matrix in
 * `icaoMatrix.ts`, which cannot saturate because it is a 25-cell grid with no
 * arithmetic in it. `kinneyAction` below is reproduced from [1]/[2] for the
 * literature comparison in the results chapter and must never be rendered as
 * an instruction to the operator.
 * ========================================================================== */

export interface RiskBand {
  degree: 1 | 2 | 3 | 4 | 5;
  min: number;
  max: number;
  situation: string;
  /**
   * Kinney's published action for this degree. REPORTING ONLY - see the note
   * above. The operational recommendation comes from the ICAO zone, exposed as
   * `recommendedAction` on a BranchRiskResult.
   */
  kinneyAction: string;
  /** Tailwind-friendly hex for the map ramp and the register table. */
  color: string;
}

export const RISK_BANDS: RiskBand[] = [
  {
    degree: 1,
    min: 0,
    max: 20,
    situation: 'Acceptable risk',
    kinneyAction: 'Routine monitoring at the normal inspection interval',
    color: '#16a34a',
  },
  {
    degree: 2,
    min: 20,
    max: 70,
    situation: 'Possible risk: attention indicated',
    kinneyAction: 'Include in the next programmed maintenance cycle',
    color: '#84cc16',
  },
  {
    degree: 3,
    min: 70,
    max: 200,
    situation: 'Substantial risk: correction needed',
    kinneyAction: 'Monitor closely and schedule corrective works',
    color: '#facc15',
  },
  {
    degree: 4,
    min: 200,
    max: 400,
    situation: 'High risk: immediate correction required',
    kinneyAction: 'Short-term action plan; bring forward in the M&R programme',
    color: '#f97316',
  },
  {
    degree: 5,
    min: 400,
    max: Number.POSITIVE_INFINITY,
    situation: 'Very high risk: consider discontinuing operation',
    kinneyAction: 'Immediate action; consider operational restriction on the branch',
    color: '#dc2626',
  },
];

/* =============================================================================
 * 3. LIKELIHOOD MAPPINGS
 * ========================================================================== */

/**
 * TIER 1 - preferred. Markov chain probability that the branch enters a
 * trigger condition state within the planning horizon, mapped onto the
 * Fine-Kinney likelihood scale.
 *
 * Bands are geometric rather than linear, because the Fine-Kinney scale is
 * itself geometric (0.1 / 0.2 / 0.5 / 1 / 3 / 6 / 10).
 */
export const MARKOV_PROBABILITY_TO_LIKELIHOOD = [
  { maxProbability: 0.02, likelihood: 0.1 },
  { maxProbability: 0.05, likelihood: 0.2 },
  { maxProbability: 0.1, likelihood: 0.5 },
  { maxProbability: 0.25, likelihood: 1 },
  { maxProbability: 0.5, likelihood: 3 },
  { maxProbability: 0.8, likelihood: 6 },
  { maxProbability: 1.0, likelihood: 10 },
] as const;

/**
 * TIER 2 and TIER 3 fallback. Maps a PCI value to a likelihood level.
 * Tier 2 feeds this the forecast PCI from a deterioration curve.
 * Tier 3 feeds it today's surveyed PCI.
 *
 * Band edges follow the ASTM D5340 rating classes [4] where they align, and
 * split the Good class (86-100) into three so the scale is not compressed at
 * the top, where most SHIA branches currently sit.
 */
export const PCI_TO_LIKELIHOOD = [
  { minPci: 95, likelihood: 0.1 }, // Good, near new
  { minPci: 86, likelihood: 0.2 }, // Good
  { minPci: 81, likelihood: 0.5 }, // Upper Satisfactory
  { minPci: 71, likelihood: 1 }, //   Satisfactory
  { minPci: 56, likelihood: 3 }, //   Fair
  { minPci: 41, likelihood: 6 }, //   Poor
  { minPci: 0, likelihood: 10 }, //   Very Poor and below
] as const;

/**
 * Data-quality escalation. A branch last inspected years ago carries more
 * uncertainty than one surveyed this year, so its likelihood is raised.
 * This is the clause that absorbs the 06/24 data-quality problem into the
 * model instead of leaving it as a caveat.
 *
 * Each entry raises L by `steps` positions on LIKELIHOOD_SCALE.
 */
export const INSPECTION_RECENCY_ESCALATION = [
  { minYearsSinceInspection: 7, steps: 2 },
  { minYearsSinceInspection: 3, steps: 1 },
  { minYearsSinceInspection: 0, steps: 0 },
] as const;

/* =============================================================================
 * 4. FREQUENCY BY OPERATIONAL ROLE
 *
 * Frequency is exposure, so it comes from how often aircraft use the branch,
 * never from its condition. Assign role once per branch in the inventory.
 * If SHIA movement counts per branch are available, replace this table with
 * measured daily movements and band them against FREQUENCY_SCALE.
 * ========================================================================== */

export type BranchRole =
  | 'runway'
  | 'high_speed_exit'
  | 'parallel_taxiway'
  | 'secondary_taxiway'
  | 'active_apron'
  | 'remote_apron'
  | 'non_movement';

export const ROLE_TO_FREQUENCY: Record<BranchRole, number> = {
  runway: 10, //            continuous, every movement
  high_speed_exit: 6, //    daily, every landing rollout
  parallel_taxiway: 6, //   daily
  secondary_taxiway: 3, //  weekly
  active_apron: 6, //       daily, stands in regular use
  remote_apron: 2, //       monthly, overflow and parking
  non_movement: 0.5, //     yearly, shoulders and service areas
};

export const ROLE_LABELS: Record<BranchRole, string> = {
  runway: 'Runway',
  high_speed_exit: 'High-speed exit taxiway',
  parallel_taxiway: 'Parallel taxiway',
  secondary_taxiway: 'Secondary taxiway',
  active_apron: 'Active apron / stand',
  remote_apron: 'Remote or overflow apron',
  non_movement: 'Non-movement area',
};

/* =============================================================================
 * 5. CONSEQUENCE BY ROLE AND HAZARD CLASS
 *
 * Hazard class groups ASTM D5340 distresses by the accident they can cause,
 * because consequence depends on the failure mode and not on the distress name.
 *
 *   fod        - loose material entering an engine or striking an airframe
 *   friction   - loss of braking or directional control, excursion risk
 *   structural - load-carrying failure under an aircraft
 *   other      - appearance and durability, no direct safety pathway
 *
 * Align these values with the airport's own SMS severity table before the
 * defence [3]. A consequence scale borrowed from the operator's live SMS is far
 * easier to defend than one written by the author.
 * ========================================================================== */

export type HazardClass = 'fod' | 'friction' | 'structural' | 'other';

export const DISTRESS_TO_HAZARD_CLASS: Record<string, HazardClass> = {
  RAVELING: 'fod',
  WEATHERING: 'fod',
  PATCHING: 'fod',
  'JET BLAST EROSION': 'fod',
  'JOINT SEAL DAMAGE': 'fod',
  SPALLING: 'fod',
  POLISHED_AGGREGATE: 'friction',
  BLEEDING: 'friction',
  RUTTING: 'friction',
  DEPRESSION: 'friction',
  CORRUGATION: 'friction',
  SHOVING: 'friction',
  SWELL: 'friction',
  'ALLIGATOR CR': 'structural',
  'L & T CR': 'structural',
  'BLOCK CR': 'structural',
  'SLIPPAGE CR': 'structural',
  'JT REFLECTION CR': 'structural',
  'OIL SPILLAGE': 'other',
};

export const CONSEQUENCE_MATRIX: Record<BranchRole, Record<HazardClass, number>> = {
  //                    fod  friction  structural  other
  runway: { fod: 40, friction: 40, structural: 15, other: 7 },
  high_speed_exit: { fod: 15, friction: 15, structural: 7, other: 3 },
  parallel_taxiway: { fod: 15, friction: 7, structural: 7, other: 3 },
  secondary_taxiway: { fod: 7, friction: 7, structural: 7, other: 3 },
  active_apron: { fod: 7, friction: 3, structural: 7, other: 3 },
  remote_apron: { fod: 3, friction: 3, structural: 3, other: 1 },
  non_movement: { fod: 1, friction: 1, structural: 3, other: 1 },
};

/* =============================================================================
 * 6. DETECTABILITY  (locked decision 6)
 *
 * v1 folded inspection-recency escalation directly into L as a silent side
 * effect. That escalation stays (INSPECTION_RECENCY_ESCALATION above) - the
 * fix here is that a SECOND, DISTINCT source of uncertainty gets its own
 * name instead of hiding inside "how stale is the survey": some failure
 * modes are missed by a routine walkover survey no matter how recent it was.
 * Raveling is visible on a walkover; a stripped bond under a sound surface
 * is not.
 *
 * HAZARD_CLASS_DETECTABILITY is a label only - every branch gets one,
 * inferred from its hazard class, and it is always shown (register column,
 * trace). It does NOT touch the score by default: DETECTABILITY_ESCALATION
 * only applies when a branch's `detectability` is explicitly set on
 * BranchRiskInput (an admin override, Admin -> Risk Inventory), never as an
 * automatic default. Reasoning for that split:
 *
 *   1. Calibrating "how much should a hidden defect raise L" for 75 branches
 *      network-wide is exactly the kind of judgment call locked decision 6
 *      says belongs to the author, not to a table applied silently on their
 *      behalf.
 *   2. The brief's own three worked examples (risk.ts, WORKED_EXAMPLES) are
 *      pinned figures reproduced by hand in the thesis. AP-REMOTE-04 carries
 *      a structural distress (ALLIGATOR CR) with no detectability override
 *      set - an automatic hazard-class default would silently move its R
 *      from 36 to 60 and falsify that worked example.
 *
 * So: the label is always live (an admin can see at a glance which branches
 * the register believes are hard to inspect), the score effect is opt-in per
 * branch. Applying it is then a deliberate, traceable choice, not a global
 * recalibration.
 * ========================================================================== */

export type Detectability = 'visible' | 'moderate' | 'hidden';

export const DETECTABILITY_LABELS: Record<Detectability, string> = {
  visible: 'Visible on walkover',
  moderate: 'Detectable with routine testing',
  hidden: 'Hidden - needs specialized inspection',
};

/** Informational default per hazard class. See the section note above. */
export const HAZARD_CLASS_DETECTABILITY: Record<HazardClass, Detectability> = {
  fod: 'visible', //        loose or missing material - visible surface loss
  friction: 'visible', //   bleeding, rutting, polishing - visible deformation
  structural: 'hidden', //  debonding, base failure - the brief's own example
  other: 'moderate',
};

/**
 * Steps added to L, applied ONLY when a branch's detectability is explicitly
 * set (never from the inferred label alone). See the section note above.
 */
export const DETECTABILITY_ESCALATION: Record<Detectability, number> = {
  visible: 0,
  moderate: 0,
  hidden: 1,
};

/* =============================================================================
 * 7. PLANNING HORIZON
 * ========================================================================== */

/** Years ahead the Markov forecast looks when deriving likelihood. */
export const PLANNING_HORIZON_YEARS = 5;

/**
 * PCI at or below which a branch is considered to have reached a trigger
 * state. Matches the first rehabilitation trigger already used in the
 * Rehabilitation Plan tab (seal coat at PCI 80).
 */
export const TRIGGER_STATE_PCI = 80;
