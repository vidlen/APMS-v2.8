import type { SectionData } from "./pci-utils.ts";
import { parsePCIValue } from "./pci-utils.ts";
import { parseDimension } from "./section-meta-utils.ts";
import type { SectionRehabOverride } from "./data-overrides.ts";

export type RehabTreatment =
  | "No M&R"
  | "Seal Coat / Crack Sealing"
  | "5 cm Overlay"
  | "6 cm Overlay"
  | "12 cm Structural Overlay";

export type RehabYear = "Year 1" | "Year 2" | "Year 3" | "Year 4" | "Year 5" | "Not Scheduled";

export const REHAB_YEARS: RehabYear[] = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Not Scheduled"];

// Same 5-color-plus-none ramp FDOT's SAPMP "5-Year Major Rehabilitation
// Needs" map uses for mr_year (captured from its published web map renderer).
export const REHAB_YEAR_COLORS: Record<RehabYear, string> = {
  "Year 1": "#ffbde8",
  "Year 2": "#ffd27e",
  "Year 3": "#a2ff73",
  "Year 4": "#73b1ff",
  "Year 5": "#73ffdf",
  "Not Scheduled": "#d4d4d4",
};

// The thesis's four-case-study treatment matrix: a PCI ceiling below which
// that treatment applies, most severe first so a branch matches exactly one
// row. Exported as-is (not just folded into getTreatment) so the tab can
// render the same table it decides from, rather than a second hand-typed
// copy of it.
export const REHAB_METHODOLOGY: { treatment: RehabTreatment; maxPci: number }[] = [
  { treatment: "12 cm Structural Overlay", maxPci: 40 },
  { treatment: "6 cm Overlay", maxPci: 53 },
  { treatment: "5 cm Overlay", maxPci: 65 },
  { treatment: "Seal Coat / Crack Sealing", maxPci: 80 },
];

// PCI above which no treatment is needed - the least severe row's ceiling.
export const REHAB_TRIGGER_PCI = REHAB_METHODOLOGY[REHAB_METHODOLOGY.length - 1].maxPci;

// Dropdown order for the admin editor: least to most severe.
export const REHAB_TREATMENTS: RehabTreatment[] = [
  "No M&R",
  ...REHAB_METHODOLOGY.map((r) => r.treatment).reverse(),
];

export interface RehabPlanItem {
  section: SectionData;
  pci: number;
  treatment: RehabTreatment;
  priorityYear: RehabYear;
  costIdr: number;
  color: string;
}

function getTreatment(pci: number): RehabTreatment {
  for (const { treatment, maxPci } of REHAB_METHODOLOGY) {
    if (pci <= maxPci) return treatment;
  }
  return "No M&R";
}

// Dummy planning-level unit rates (IDR/m²) - not a quantity-surveyed cost,
// just enough to make "funds needed" scale sensibly with treatment severity
// and section size instead of showing a flat or fabricated-looking number.
// Upgrade path: replace with a real bill of quantities.
const DUMMY_UNIT_RATE_IDR: Record<Exclude<RehabTreatment, "No M&R">, number> = {
  "Seal Coat / Crack Sealing": 50_000,
  "5 cm Overlay": 350_000,
  "6 cm Overlay": 420_000,
  "12 cm Structural Overlay": 850_000,
};

// Fallback area for the rare section whose Dimension string doesn't parse
// (see parseDimension) - keeps cost estimation total, not silently zero.
const DEFAULT_AREA_M2 = 1000;

function estimateAreaM2(section: SectionData): number {
  const parsed = section.Dimension ? parseDimension(section.Dimension) : null;
  if (!parsed) return DEFAULT_AREA_M2;
  return parsed.kind === "area" ? parsed.area : parsed.length * parsed.width;
}

function estimateCostIdr(treatment: RehabTreatment, section: SectionData): number {
  if (treatment === "No M&R") return 0;
  return Math.round(estimateAreaM2(section) * DUMMY_UNIT_RATE_IDR[treatment]);
}

export function formatIdr(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatIdrCompact(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

// Priority year: branches that trigger (any treatment other than No M&R) are
// ranked worst-PCI-first - the same ordering risk.ts' comparePriorityOrders
// already compares itself against - and spread evenly across a 5-year
// window, worst branches first. `overrides` (Admin -> Rehabilitation Plan,
// same localStorage-demo status as the Risk Inventory overrides) replaces
// the computed treatment/priorityYear/cost per branch; it never changes
// which branches count as "triggered" for the auto-bucketing above, so
// overriding one branch can't silently reshuffle every other branch's year.
export function computeRehabPlan(
  sections: SectionData[],
  overrides: Record<string, SectionRehabOverride> = {},
): RehabPlanItem[] {
  const branches = sections.filter((s) => s.sampleUnit === undefined);

  const scored = branches.map((section) => {
    const pci = parsePCIValue(section["PCI Rating"]);
    return { section, pci, treatment: getTreatment(pci) };
  });

  const triggered = scored.filter((s) => s.treatment !== "No M&R").sort((a, b) => a.pci - b.pci);
  const yearBySection = new Map<string, RehabYear>();
  triggered.forEach((item, i) => {
    const bucket = Math.min(4, Math.floor((i * 5) / triggered.length));
    yearBySection.set(item.section.Section, REHAB_YEARS[bucket]);
  });

  return scored.map((item) => {
    const override = overrides[item.section.Section];
    const treatment = override?.treatment ?? item.treatment;
    const priorityYear = override?.priorityYear ?? yearBySection.get(item.section.Section) ?? "Not Scheduled";
    const costIdr = override?.costIdr ?? estimateCostIdr(treatment, item.section);
    return { section: item.section, pci: item.pci, treatment, priorityYear, costIdr, color: REHAB_YEAR_COLORS[priorityYear] };
  });
}
