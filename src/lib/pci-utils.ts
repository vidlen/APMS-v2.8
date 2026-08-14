// PCI Classification based on original qgis2web data
export interface PCICategory {
  min: number;
  max: number;
  label: string;
  color: string;
  fillColor: string;
  textColor: string;
}

export const pciCategories: PCICategory[] = [
  { min: 0, max: 11, label: "Failed", color: "#efefef", fillColor: "rgba(239,239,239,0.72)", textColor: "#333" },
  { min: 11, max: 26, label: "Serious", color: "#b40000", fillColor: "rgba(180,0,0,0.72)", textColor: "#fff" },
  { min: 26, max: 41, label: "Very Poor", color: "#ff6dce", fillColor: "rgba(255,109,206,0.72)", textColor: "#fff" },
  { min: 41, max: 56, label: "Poor", color: "#ff821b", fillColor: "rgba(255,130,27,0.72)", textColor: "#fff" },
  { min: 56, max: 71, label: "Fair", color: "#fefe00", fillColor: "rgba(254,254,0,0.72)", textColor: "#333" },
  { min: 71, max: 86, label: "Satisfactory", color: "#b2df8a", fillColor: "rgba(178,223,138,0.72)", textColor: "#333" },
  { min: 86, max: 100, label: "Good", color: "#5a9a33", fillColor: "rgba(90,154,51,0.72)", textColor: "#fff" },
];

export function getPCICategory(pciValue: number): PCICategory {
  // Use strict >= and <= to match original qgis2web logic
  for (const cat of pciCategories) {
    if (pciValue >= cat.min && pciValue <= cat.max) {
      return cat;
    }
  }
  return pciCategories[pciCategories.length - 1];
}

export function getPCIStyle(pciValue: number) {
  const cat = getPCICategory(pciValue);
  return {
    fill: cat.fillColor,
    stroke: "rgba(35,35,35,0.7)",
    strokeWidth: 1,
  };
}

export function getPCIColor(pciValue: number): string {
  return getPCICategory(pciValue).color;
}

export interface SectionData {
  Section: string;
  "PCI Rating": string;
  PCN: string;
  Type: string;
  sampleUnit?: number;
  "Last Major Construction Year"?: string;
  Dimension?: string;
}

export function parsePCIValue(pciStr: string): number {
  return parseFloat(pciStr);
}

// Overall branch PCI for sections backed by sample units is the mean of
// those units' scores, rounded to 1 decimal place.
export function computeSectionPci(unitScores: number[]): number {
  if (unitScores.length === 0) return 0;
  const avg = unitScores.reduce((sum, s) => sum + s, 0) / unitScores.length;
  return Math.round(avg * 10) / 10;
}

export function formatPciValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Count of sections per PCI condition band, including zero-count bands, so
// callers can tell "no sections in this range" apart from "not computed yet".
export function countByCondition(sections: SectionData[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cat of pciCategories) counts[cat.label] = 0;
  for (const s of sections) {
    const label = getPCICategory(parsePCIValue(s["PCI Rating"])).label;
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

// Network-wide average PCI — the single shared source for every "Average
// PCI" figure shown across the app (StatsBar, the tab bar's scope strip),
// so they can never drift apart from one another.
export function averagePci(sections: SectionData[]): number {
  if (sections.length === 0) return 0;
  return sections.reduce((sum, s) => sum + parsePCIValue(s["PCI Rating"]), 0) / sections.length;
}
