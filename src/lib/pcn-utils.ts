// Decodes the ICAO Annex 14 PCN (Pavement Classification Number) reporting
// code — e.g. "111/R/D/W/T" — into human-readable meaning. The numeric
// value itself is the reported pavement bearing strength; the four letter
// codes that follow are standardized categories, not free text.
export interface PCNCodeMeaning {
  code: string;
  label: string;
  description: string;
}

const UNKNOWN = (code: string): PCNCodeMeaning => ({
  code,
  label: code || "—",
  description: "Unrecognized code",
});

export const PCN_PAVEMENT_TYPE: Record<string, PCNCodeMeaning> = {
  R: { code: "R", label: "Rigid", description: "Concrete pavement" },
  F: { code: "F", label: "Flexible", description: "Asphalt pavement" },
};

export const PCN_SUBGRADE_CATEGORY: Record<string, PCNCodeMeaning> = {
  A: { code: "A", label: "High strength", description: "CBR 15 or K = 150 MN/m³ and above" },
  B: { code: "B", label: "Medium strength", description: "CBR 10 or K = 80 MN/m³" },
  C: { code: "C", label: "Low strength", description: "CBR 6 or K = 40 MN/m³" },
  D: { code: "D", label: "Ultra-low strength", description: "CBR 3 or K = 20 MN/m³ and below" },
};

export const PCN_TIRE_PRESSURE: Record<string, PCNCodeMeaning> = {
  W: { code: "W", label: "High", description: "No pressure limit" },
  X: { code: "X", label: "Medium", description: "Limited to 1.50 MPa (217 psi)" },
  Y: { code: "Y", label: "Low", description: "Limited to 1.00 MPa (145 psi)" },
  Z: { code: "Z", label: "Very low", description: "Limited to 0.50 MPa (73 psi)" },
};

export const PCN_EVALUATION_METHOD: Record<string, PCNCodeMeaning> = {
  T: { code: "T", label: "Technical", description: "Based on a specific study of pavement structural behavior" },
  U: { code: "U", label: "Using aircraft experience", description: "Based on knowledge of aircraft types safely using the pavement" },
};

export function describePCNPart(
  table: Record<string, PCNCodeMeaning>,
  code: string
): PCNCodeMeaning {
  return table[code] ?? UNKNOWN(code);
}
