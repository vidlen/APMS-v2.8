import { useMemo } from "react";
import type { SectionData } from "@/lib/pci-utils";
import { useEffectiveYearData } from "@/lib/data-store";

export function usePavementData(year: string) {
  const { sectionsFC, loading, error } = useEffectiveYearData(year);

  const sections: SectionData[] = useMemo(() => {
    if (!sectionsFC) return [];
    return sectionsFC.features.map((f) => f.properties as unknown as SectionData);
  }, [sectionsFC]);

  return { sections, loading, error };
}
