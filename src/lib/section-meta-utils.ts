// Decodes the two free-text branch metadata fields exported alongside PCI
// data. Source formatting is inconsistent across rows (missing dashes,
// missing spaces, "Construction" vs "New Construction"), so these parsers
// tolerate that rather than assuming one exact pattern.

export interface ConstructionYear {
  year: string;
  caption: string;
}

// "2024 - Overlay" / "1986 New Construction" / "2019 -New Construction" -> { year, caption }
export function parseConstructionYear(raw: string): ConstructionYear | null {
  const match = raw.trim().match(/^(\d{4})\s*-?\s*(.*)$/);
  if (!match) return null;
  return { year: match[1], caption: match[2].trim() };
}

export type ParsedDimension =
  | { kind: "linear"; length: number; width: number }
  | { kind: "area"; area: number };

// "3000 x 60 m" / "2020x 23 m" -> the larger figure is always the length,
// regardless of which side of "x" it's written on. "45455 m2" (an apron's
// area rather than a strip's length x width) -> area in m², correcting the
// source data's plain "m2" to the proper unit.
export function parseDimension(raw: string): ParsedDimension | null {
  const trimmed = raw.trim();
  const linear = trimmed.match(/^([\d.]+)\s*x\s*([\d.]+)\s*m$/i);
  if (linear) {
    const a = parseFloat(linear[1]);
    const b = parseFloat(linear[2]);
    return { kind: "linear", length: Math.max(a, b), width: Math.min(a, b) };
  }
  const area = trimmed.match(/^([\d.]+)\s*m2$/i);
  if (area) {
    return { kind: "area", area: parseFloat(area[1]) };
  }
  return null;
}
