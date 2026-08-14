import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { getPCICategory, computeSectionPci, formatPciValue } from "@/lib/pci-utils";
import { SEED_YEARS, getSeedSectionsUrl, type YearMeta } from "@/lib/survey-years";
import { SEED_SAMPLE_UNIT_SOURCES } from "@/lib/sample-units";
import type { GeoJSONFeatureCollection } from "@/lib/geojson-types";
import {
  loadOverrides,
  saveOverrides,
  clearOverridesStorage,
  emptyOverrides,
  mergeSectionRiskMeta,
  mergeSectionInventory,
  mergeSectionRehab,
  type DataOverrides,
  type SectionRiskMetaOverride,
  type SectionInventoryOverride,
  type SectionRehabOverride,
} from "@/lib/data-overrides";

export interface LiveYearMeta extends YearMeta {
  hasData: boolean;
}

// ---------------------------------------------------------------------------
// Base-file fetch cache (module-level, outside React state) so switching
// years or editing scores never re-fetches/re-parses an already-loaded
// committed JSON file.
// ---------------------------------------------------------------------------
const baseFetchCache = new Map<string, Promise<GeoJSONFeatureCollection>>();

function fetchJsonCached(url: string): Promise<GeoJSONFeatureCollection> {
  let pending = baseFetchCache.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${url}`);
      return res.json();
    });
    pending.catch(() => baseFetchCache.delete(url));
    baseFetchCache.set(url, pending);
  }
  return pending;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function resolveYears(overrides: DataOverrides): YearMeta[] {
  const removed = new Set(overrides.removedYears);
  const all = [...SEED_YEARS, ...overrides.addedYears].filter((y) => !removed.has(y.id));
  const map = new Map<string, YearMeta>();
  for (const y of all) map.set(y.id, y);
  return Array.from(map.values());
}

// Walks the clonedFrom chain to find the nearest ancestor that has a
// committed seed file, or null if the chain is broken/empty (no data).
function resolveSeedAncestor(year: string, years: YearMeta[]): string | null {
  let current = years.find((y) => y.id === year) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (getSeedSectionsUrl(current.id)) return current.id;
    if (!current.clonedFrom) return null;
    current = years.find((y) => y.id === current!.clonedFrom) ?? null;
  }
  return null;
}

function getSectionsWithUnitsForYear(
  year: string,
  years: YearMeta[],
  overrides: DataOverrides
): string[] {
  if (overrides.uploadedUnits[year]) return Object.keys(overrides.uploadedUnits[year]);
  const seedId = resolveSeedAncestor(year, years);
  if (!seedId) return [];
  return Object.keys(SEED_SAMPLE_UNIT_SOURCES[seedId] ?? {});
}

async function fetchBaseSections(
  year: string,
  years: YearMeta[]
): Promise<GeoJSONFeatureCollection | null> {
  const seedId = resolveSeedAncestor(year, years);
  if (!seedId) return null;
  const url = getSeedSectionsUrl(seedId);
  if (!url) return null;
  return fetchJsonCached(url);
}

async function fetchBaseUnits(
  year: string,
  section: string,
  years: YearMeta[]
): Promise<GeoJSONFeatureCollection | null> {
  const seedId = resolveSeedAncestor(year, years);
  if (!seedId) return null;
  const url = SEED_SAMPLE_UNIT_SOURCES[seedId]?.[section];
  if (!url) return null;
  return fetchJsonCached(url);
}

interface EffectiveData {
  sectionsFC: GeoJSONFeatureCollection | null;
  unitsBySection: Record<string, GeoJSONFeatureCollection>;
}

// Applies unit-score overrides, then derives each unit-backed section's
// overall PCI as the mean of its (possibly-edited) unit scores; non-unit
// sections use their direct PCI override (or the base value untouched).
function computeEffectiveData(
  sectionsFC: GeoJSONFeatureCollection,
  unitsBySection: Record<string, GeoJSONFeatureCollection>,
  year: string,
  overrides: DataOverrides
): EffectiveData {
  const unitScoreOverrides = overrides.unitScores[year] ?? {};
  const sectionPciOverrides = overrides.sectionPci[year] ?? {};
  const sectionInventoryOverrides = overrides.sectionInventory[year] ?? {};

  const effectiveUnitsBySection: Record<string, GeoJSONFeatureCollection> = {};
  for (const [section, fc] of Object.entries(unitsBySection)) {
    const overridesForSection = unitScoreOverrides[section] ?? {};
    if (Object.keys(overridesForSection).length === 0) {
      effectiveUnitsBySection[section] = fc;
      continue;
    }
    effectiveUnitsBySection[section] = {
      ...fc,
      features: fc.features.map((f) => {
        const unitId = f.properties["sampleUnit"] as number;
        const overrideScore = overridesForSection[unitId];
        if (overrideScore === undefined) return f;
        return {
          ...f,
          properties: {
            ...f.properties,
            pci_score: overrideScore,
            pci_rating: getPCICategory(overrideScore).label,
          },
        };
      }),
    };
  }

  const effectiveSections: GeoJSONFeatureCollection = {
    ...sectionsFC,
    features: sectionsFC.features.map((f) => {
      const sectionName = f.properties["Section"] as string;
      let properties = f.properties;

      const unitFC = effectiveUnitsBySection[sectionName];
      if (unitFC && unitFC.features.length > 0) {
        const scores = unitFC.features.map((uf) => uf.properties["pci_score"] as number);
        const avg = computeSectionPci(scores);
        properties = { ...properties, "PCI Rating": formatPciValue(avg) };
      } else {
        const pciOverride = sectionPciOverrides[sectionName];
        if (pciOverride !== undefined) properties = { ...properties, "PCI Rating": pciOverride };
      }

      const inventoryOverride = sectionInventoryOverrides[sectionName];
      if (inventoryOverride) properties = { ...properties, ...inventoryOverride };

      return properties === f.properties ? f : { ...f, properties };
    }),
  };

  return { sectionsFC: effectiveSections, unitsBySection: effectiveUnitsBySection };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface DataContextValue {
  overrides: DataOverrides;
  years: LiveYearMeta[];
  setSectionPci: (year: string, section: string, pci: string) => void;
  setUnitScore: (year: string, section: string, unitId: number, score: number) => void;
  setSectionRiskMeta: (year: string, section: string, patch: Partial<SectionRiskMetaOverride>) => void;
  setSectionInventory: (year: string, section: string, patch: SectionInventoryOverride) => void;
  setSectionRehab: (year: string, section: string, patch: Partial<SectionRehabOverride>) => void;
  addYear: (input: { label: string; clonedFrom: string | null }) => string;
  removeYear: (id: string) => void;
  importSectionsGeoJSON: (year: string, fc: GeoJSONFeatureCollection) => void;
  importUnitsGeoJSON: (year: string, section: string, fc: GeoJSONFeatureCollection) => void;
  resetDrafts: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<DataOverrides>(() => loadOverrides());
  const isFirstRender = useRef(true);

  // Persisting to localStorage is a side effect on an external system, not
  // React state — surface failures via a toast rather than component state.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const result = saveOverrides(overrides);
    if (!result.ok) {
      toast.error(result.error ?? "Failed to save changes locally.");
    }
  }, [overrides]);

  const rawYears = useMemo(() => resolveYears(overrides), [overrides]);

  const years = useMemo<LiveYearMeta[]>(
    () =>
      rawYears.map((y) => ({
        ...y,
        hasData:
          overrides.uploadedSections[y.id] !== undefined ||
          resolveSeedAncestor(y.id, rawYears) !== null,
      })),
    [rawYears, overrides.uploadedSections]
  );

  const setSectionPci = useCallback((year: string, section: string, pci: string) => {
    setOverrides((prev) => ({
      ...prev,
      sectionPci: {
        ...prev.sectionPci,
        [year]: { ...(prev.sectionPci[year] ?? {}), [section]: pci },
      },
    }));
  }, []);

  const setUnitScore = useCallback(
    (year: string, section: string, unitId: number, score: number) => {
      setOverrides((prev) => ({
        ...prev,
        unitScores: {
          ...prev.unitScores,
          [year]: {
            ...(prev.unitScores[year] ?? {}),
            [section]: { ...(prev.unitScores[year]?.[section] ?? {}), [unitId]: score },
          },
        },
      }));
    },
    []
  );

  const setSectionInventory = useCallback(
    (year: string, section: string, patch: SectionInventoryOverride) => {
      setOverrides((prev) => {
        const merged = mergeSectionInventory(prev.sectionInventory[year]?.[section] ?? {}, patch);
        return {
          ...prev,
          sectionInventory: {
            ...prev.sectionInventory,
            [year]: { ...(prev.sectionInventory[year] ?? {}), [section]: merged },
          },
        };
      });
    },
    []
  );

  const setSectionRiskMeta = useCallback(
    (year: string, section: string, patch: Partial<SectionRiskMetaOverride>) => {
      setOverrides((prev) => {
        const merged = mergeSectionRiskMeta(prev.sectionRiskMeta[year]?.[section] ?? {}, patch);
        return {
          ...prev,
          sectionRiskMeta: {
            ...prev.sectionRiskMeta,
            [year]: { ...(prev.sectionRiskMeta[year] ?? {}), [section]: merged },
          },
        };
      });
    },
    [],
  );

  const setSectionRehab = useCallback(
    (year: string, section: string, patch: Partial<SectionRehabOverride>) => {
      setOverrides((prev) => {
        const merged = mergeSectionRehab(prev.sectionRehab[year]?.[section] ?? {}, patch);
        return {
          ...prev,
          sectionRehab: {
            ...prev.sectionRehab,
            [year]: { ...(prev.sectionRehab[year] ?? {}), [section]: merged },
          },
        };
      });
    },
    [],
  );

  const addYear = useCallback((input: { label: string; clonedFrom: string | null }) => {
    const id = input.label.trim();
    setOverrides((prev) => ({
      ...prev,
      addedYears: [
        ...prev.addedYears.filter((y) => y.id !== id),
        { id, label: input.label.trim(), clonedFrom: input.clonedFrom },
      ],
      removedYears: prev.removedYears.filter((y) => y !== id),
    }));
    return id;
  }, []);

  const removeYear = useCallback((id: string) => {
    setOverrides((prev) => ({
      addedYears: prev.addedYears.filter((y) => y.id !== id),
      removedYears: SEED_YEARS.some((y) => y.id === id)
        ? Array.from(new Set([...prev.removedYears, id]))
        : prev.removedYears,
      sectionPci: omitKey(prev.sectionPci, id),
      unitScores: omitKey(prev.unitScores, id),
      uploadedSections: omitKey(prev.uploadedSections, id),
      uploadedUnits: omitKey(prev.uploadedUnits, id),
      sectionRiskMeta: omitKey(prev.sectionRiskMeta, id),
      sectionInventory: omitKey(prev.sectionInventory, id),
      sectionRehab: omitKey(prev.sectionRehab, id),
    }));
  }, []);

  const importSectionsGeoJSON = useCallback((year: string, fc: GeoJSONFeatureCollection) => {
    setOverrides((prev) => ({
      ...prev,
      uploadedSections: { ...prev.uploadedSections, [year]: fc },
    }));
  }, []);

  const importUnitsGeoJSON = useCallback(
    (year: string, section: string, fc: GeoJSONFeatureCollection) => {
      setOverrides((prev) => ({
        ...prev,
        uploadedUnits: {
          ...prev.uploadedUnits,
          [year]: { ...(prev.uploadedUnits[year] ?? {}), [section]: fc },
        },
      }));
    },
    []
  );

  const resetDrafts = useCallback(() => {
    clearOverridesStorage();
    setOverrides(emptyOverrides());
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      overrides,
      years,
      setSectionPci,
      setUnitScore,
      setSectionRiskMeta,
      setSectionInventory,
      setSectionRehab,
      addYear,
      removeYear,
      importSectionsGeoJSON,
      importUnitsGeoJSON,
      resetDrafts,
    }),
    [
      overrides,
      years,
      setSectionPci,
      setUnitScore,
      setSectionRiskMeta,
      setSectionInventory,
      setSectionRehab,
      addYear,
      removeYear,
      importSectionsGeoJSON,
      importUnitsGeoJSON,
      resetDrafts,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}

export function useSectionsWithUnits(year: string): string[] {
  const { overrides, years } = useData();
  return useMemo(
    () => getSectionsWithUnitsForYear(year, years, overrides),
    [year, years, overrides]
  );
}

interface RawYearData {
  sectionsFC: GeoJSONFeatureCollection | null;
  unitsBySection: Record<string, GeoJSONFeatureCollection>;
  loading: boolean;
  error: string | null;
}

export function useEffectiveYearData(year: string): RawYearData & EffectiveData {
  const { overrides, years } = useData();
  const [raw, setRaw] = useState<RawYearData>({
    sectionsFC: null,
    unitsBySection: {},
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setRaw((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const sectionsFC =
          overrides.uploadedSections[year] ?? (await fetchBaseSections(year, years));
        if (!sectionsFC) {
          if (!cancelled) setRaw({ sectionsFC: null, unitsBySection: {}, loading: false, error: null });
          return;
        }
        const sectionNames = getSectionsWithUnitsForYear(year, years, overrides);
        const entries = await Promise.all(
          sectionNames.map(async (name) => {
            const fc =
              overrides.uploadedUnits[year]?.[name] ?? (await fetchBaseUnits(year, name, years));
            return [name, fc] as const;
          })
        );
        const unitsBySection: Record<string, GeoJSONFeatureCollection> = {};
        for (const [name, fc] of entries) if (fc) unitsBySection[name] = fc;
        if (!cancelled) setRaw({ sectionsFC, unitsBySection, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setRaw({
            sectionsFC: null,
            unitsBySection: {},
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load pavement data",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, years, overrides.uploadedSections, overrides.uploadedUnits]);

  const effective = useMemo<EffectiveData>(() => {
    if (!raw.sectionsFC) return { sectionsFC: null, unitsBySection: {} };
    return computeEffectiveData(raw.sectionsFC, raw.unitsBySection, year, overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw.sectionsFC, raw.unitsBySection, year, overrides.sectionPci, overrides.unitScores, overrides.sectionInventory]);

  return {
    sectionsFC: effective.sectionsFC,
    unitsBySection: effective.unitsBySection,
    loading: raw.loading,
    error: raw.error,
  };
}
