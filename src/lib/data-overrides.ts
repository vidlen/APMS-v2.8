import type { GeoJSONFeatureCollection } from "@/lib/geojson-types";
import type { BranchRole, Detectability } from "@/config/riskScales";
import type { SectionData } from "@/lib/pci-utils";
import type { RehabTreatment, RehabYear } from "@/lib/rehab";
import type { RepairLogRecord } from "@/lib/repair-log";

export interface AddedYearMeta {
  id: string;
  label: string;
  clonedFrom: string | null;
}

// Backlog item L: an expert can override the ENGINE'S COMPUTED L, F, C
// outright, rather than adjusting the inputs (role/distress/etc.) that feed
// the computation. Mirrors BranchRiskInput['overrides'] in risk.ts field for
// field so risk-adapter.ts can pass it straight through unchanged. setOn is
// stamped automatically when the form saves (see LfcOverrideDialog) rather
// than typed by the admin - a free-text "when I set this" field invites
// backdating, and an audit stamp shouldn't be editable by the thing it audits.
export interface LfcOverride {
  likelihood?: number;
  frequency?: number;
  consequence?: number;
  note?: string;
  setBy?: string;
  setOn?: string;
}

// Per-branch risk inventory fields the source GeoJSON doesn't carry yet
// (brief backlog item B). Same demo-override status as sectionPci below:
// the risk engine falls back to a derived default (risk-adapter.ts) when a
// field here is absent, never a hard failure.
export interface SectionRiskMetaOverride {
  role?: BranchRole;
  lastInspectionYear?: number;
  dominantDistress?: string;
  /** Explicit detectability (locked decision 6) - setting this also escalates L, see risk.ts. */
  detectability?: Detectability;
  /** Expert L/F/C override (backlog L). Saved as one atomic object, not merged field-by-field. */
  lfcOverride?: LfcOverride;
}

// Per-branch rehabilitation plan fields (Admin -> Rehabilitation Plan). Same
// demo-override status as sectionRiskMeta above: computeRehabPlan (rehab.ts)
// falls back to its computed treatment/priorityYear/dummy cost when a field
// here is absent, never a hard failure.
export interface SectionRehabOverride {
  treatment?: RehabTreatment;
  priorityYear?: RehabYear;
  /** Planning-level placeholder cost in IDR - see rehab.ts, not a real estimate. */
  costIdr?: number;
}

// A correction to the base GeoJSON's own inventory fields (pavement type,
// PCN, dimension, last major construction year) - same field names as
// SectionData, so applying it is a plain spread onto feature.properties.
export type SectionInventoryOverride = Partial<
  Pick<SectionData, "Type" | "PCN" | "Dimension" | "Last Major Construction Year">
>;

// Everything an admin can change, stored as a compact set of deltas rather
// than full data copies — base survey files (megabytes) are never
// duplicated into localStorage, only the edits on top of them.
export interface DataOverrides {
  addedYears: AddedYearMeta[];
  removedYears: string[];
  sectionPci: Record<string, Record<string, string>>;
  unitScores: Record<string, Record<string, Record<number, number>>>;
  uploadedSections: Record<string, GeoJSONFeatureCollection>;
  uploadedUnits: Record<string, Record<string, GeoJSONFeatureCollection>>;
  sectionRiskMeta: Record<string, Record<string, SectionRiskMetaOverride>>;
  sectionInventory: Record<string, Record<string, SectionInventoryOverride>>;
  sectionRehab: Record<string, Record<string, SectionRehabOverride>>;
  /**
   * Admin-imported repair log (Admin -> Repair Log, brief section 6.1),
   * replacing the seeded public/data/repair-log-2025.json wholesale. Not
   * year-scoped like the fields above: the log is a continuous 7-month event
   * stream, not a per-survey-year snapshot, so one import applies regardless
   * of which PCI survey year is being viewed. Undefined means "use the seed".
   */
  repairLog?: RepairLogRecord[];
}

// Merges a partial patch into an existing override object. A key explicitly
// patched to `undefined` (an admin reverting a field to its base/inferred
// value) is deleted rather than stored as `undefined`, so it doesn't linger
// in localStorage as a phantom override.
function mergePatch<T extends object>(existing: T, patch: Partial<T>): T {
  const merged: T = { ...existing, ...patch };
  for (const key of Object.keys(merged) as (keyof T)[]) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}

export function mergeSectionRiskMeta(
  existing: SectionRiskMetaOverride,
  patch: Partial<SectionRiskMetaOverride>
): SectionRiskMetaOverride {
  return mergePatch(existing, patch);
}

export function mergeSectionInventory(
  existing: SectionInventoryOverride,
  patch: SectionInventoryOverride
): SectionInventoryOverride {
  return mergePatch(existing, patch);
}

export function mergeSectionRehab(
  existing: SectionRehabOverride,
  patch: Partial<SectionRehabOverride>
): SectionRehabOverride {
  return mergePatch(existing, patch);
}

const STORAGE_KEY = "apms-data-overrides-v1";

export function emptyOverrides(): DataOverrides {
  return {
    addedYears: [],
    removedYears: [],
    sectionPci: {},
    unitScores: {},
    uploadedSections: {},
    uploadedUnits: {},
    sectionRiskMeta: {},
    sectionInventory: {},
    sectionRehab: {},
  };
}

export function loadOverrides(): DataOverrides {
  if (typeof localStorage === "undefined") return emptyOverrides();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyOverrides();
    const parsed = JSON.parse(raw);
    return { ...emptyOverrides(), ...parsed };
  } catch {
    return emptyOverrides();
  }
}

export function saveOverrides(overrides: DataOverrides): { ok: boolean; error?: string } {
  if (typeof localStorage === "undefined") return { ok: true };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    return { ok: true };
  } catch (err) {
    const isQuotaError =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      error: isQuotaError
        ? "Local storage is full. Export your changes, then reset drafts to free up space."
        : "Failed to save changes locally.",
    };
  }
}

export function clearOverridesStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
