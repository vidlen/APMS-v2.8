/**
 * risk-cost.ts
 * -----------------------------------------------------------------------------
 * Alberti & Fiori (2019)'s R/C ratio (Eq. 2): risk removed per unit of cost,
 * used to rank rehabilitation treatments by which one buys the most risk
 * reduction for the money. Phase 7 of the v2.8 plan - gated behind explicit
 * approval because it is the one piece of this brief that touches the
 * Rehabilitation Plan tab and rehab.ts, both out of scope for the repair-log
 * work itself.
 *
 *   R/C = sum(RS_before - RS_after) / sum(min cost)
 *
 * Applied per branch here rather than summed across a whole strategy (which
 * is what Alberti's own worksheet does over a multi-year reference period):
 * riskBefore and riskAfter are Fine-Kinney R (risk.ts scoreBranch) at the
 * branch's current PCI and at the PCI its rehab-plan treatment resets it to
 * (rehab.ts resetPci). costIdr is the plan's own planning-level estimate
 * (rehab.ts estimateCostIdr, already computed onto every RehabPlanItem).
 *
 * ONLY L MOVES BETWEEN BEFORE AND AFTER.
 *   F (role) and C (hazard class, from dominantDistress) are held constant -
 *   a resurfacing treatment does not change what kind of aircraft use a
 *   branch or what failure mode its distress represents, only its condition.
 *   This matches Alberti's own framing of a "protective" action: it reduces
 *   risk by improving condition, not by changing what could go wrong ("Risk
 *   Mitigation": RSACC held constant, only the pavement-condition term moves
 *   under a protective strategy). Concretely: BranchRiskInput is spread
 *   unchanged except for currentPci, so hazardClassFor(dominantDistress)
 *   cannot move even in principle.
 *
 * TIER 3 ONLY, BOTH SIDES.
 *   computeRehabPlan has never modelled a Markov or curve forecast - the
 *   whole Rehabilitation Plan tab works off today's surveyed PCI. Giving
 *   "before" a Tier 1/2 evidence source while "after" is necessarily Tier 3
 *   (a treatment resets a MEASURED PCI, not a forecast) would compare two
 *   different kinds of evidence rather than the same branch's condition at
 *   two points in time, so both sides strip markovTriggerProbability and
 *   forecastPci before scoring.
 *
 * NOTE ON IMPORT EXTENSIONS
 *   Relative imports use an explicit `.ts` extension so `node --test` can
 *   resolve this module directly. See the note in risk.ts.
 * -----------------------------------------------------------------------------
 */

import { scoreBranch, type BranchRiskInput } from './risk.ts';
import { resetPci, type RehabPlanItem, type RehabTreatment } from './rehab.ts';

export interface RiskCostResult {
  branchId: string;
  branchName: string;
  treatment: RehabTreatment;
  currentPci: number;
  afterPci: number;
  riskBefore: number;
  riskAfter: number;
  riskRemoved: number;
  costIdr: number;
  /** Risk removed per million IDR spent. Scaled up from risk-removed-per-IDR,
   *  which for a multi-hundred-million-rupiah treatment would round to
   *  0.000x on every branch and make the ranking unreadable. */
  ratioPerMillionIdr: number;
}

/** Strips Tier 1/2 evidence so scoreBranch falls back to Tier 3 (current PCI)
 *  regardless of what the caller's BranchRiskInput carries - see the file
 *  header for why both sides of the comparison need the same tier. */
function toTier3(input: BranchRiskInput): BranchRiskInput {
  return { ...input, markovTriggerProbability: undefined, forecastPci: undefined };
}

/**
 * Risk removed and cost for one branch's rehab-plan treatment. `item` takes
 * only the two fields this needs (Pick, not the whole RehabPlanItem) so a
 * caller building a synthetic item for a test doesn't have to fabricate a
 * SectionData.
 */
export function riskCostForBranch(
  input: BranchRiskInput,
  item: Pick<RehabPlanItem, 'treatment' | 'costIdr'>,
  currentYear?: number,
): RiskCostResult {
  const tier3Input = toTier3(input);
  const before = scoreBranch(tier3Input, currentYear);

  const afterPci = resetPci(input.currentPci, item.treatment);
  const after = scoreBranch({ ...tier3Input, currentPci: afterPci }, currentYear);

  const riskRemoved = before.riskScore - after.riskScore;
  const ratioPerMillionIdr = item.costIdr > 0 ? (riskRemoved / item.costIdr) * 1_000_000 : 0;

  return {
    branchId: input.branchId,
    branchName: input.branchName,
    treatment: item.treatment,
    currentPci: input.currentPci,
    afterPci,
    riskBefore: before.riskScore,
    riskAfter: after.riskScore,
    riskRemoved,
    costIdr: item.costIdr,
    ratioPerMillionIdr,
  };
}

/**
 * Ranks every TRIGGERED branch (treatment !== 'No M&R') by risk removed per
 * million IDR, highest first - the branch where money buys the most risk
 * reduction leads, the direct empirical answer to whether risk-based
 * prioritisation reorders the programme (Alberti's own conclusion: a
 * risk-based approach beats a performance-based one).
 *
 * A branch the rehab plan covers but the risk engine has no matching
 * BranchRiskInput for is skipped rather than defaulted - scoring it would
 * mean inventing a role and hazard class this function has no business
 * guessing. In the running app this only happens for a branch outside the
 * currently loaded network, which should not occur in practice since both
 * inputs come from the same section list.
 */
export function rankByRiskCost(
  plan: RehabPlanItem[],
  inputsByBranch: Record<string, BranchRiskInput>,
  currentYear?: number,
): RiskCostResult[] {
  const results: RiskCostResult[] = [];
  for (const item of plan) {
    if (item.treatment === 'No M&R') continue;
    const input = inputsByBranch[item.section.Section];
    if (!input) continue;
    results.push(riskCostForBranch(input, item, currentYear));
  }
  return results.sort((a, b) => b.ratioPerMillionIdr - a.ratioPerMillionIdr);
}
