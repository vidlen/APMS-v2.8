import type { GeoJSONFeatureCollection } from "@/lib/geojson-types";

// Reproduces the naming convention already used by the committed files in
// /public/data — 2025 (the original dataset) has no year suffix, every
// other year does.
export function sectionsFileName(year: string): string {
  return year === "2025" ? "pavement-data.json" : `pavement-data-${year}.json`;
}

export function unitsFileName(year: string, section: string): string {
  const slug = section.replace(/\//g, "-");
  return year === "2025" ? `runway-${slug}-units.json` : `runway-${slug}-units-${year}.json`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type GeoJSONValidationResult =
  | { ok: true; data: GeoJSONFeatureCollection }
  | { ok: false; error: string };

// Only CRS84 / EPSG:4326 (lon/lat) GeoJSON is accepted — the app's map and
// every committed data file already use this projection, and silently
// importing projected coordinates would place features in the wrong spot.
export function validateGeoJSONCollection(json: unknown): GeoJSONValidationResult {
  if (typeof json !== "object" || json === null) {
    return { ok: false, error: "Not a valid JSON object." };
  }
  const obj = json as Record<string, unknown>;
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    return { ok: false, error: "Not a GeoJSON FeatureCollection." };
  }
  const crs = obj.crs as { properties?: { name?: string } } | undefined;
  const crsName = crs?.properties?.name ?? "";
  const isCRS84 = !crs || crsName.includes("CRS84") || crsName.includes("4326");
  if (!isCRS84) {
    return {
      ok: false,
      error: `Unsupported CRS "${crsName}". Reproject to EPSG:4326 / CRS84 (lon/lat) before importing.`,
    };
  }
  return { ok: true, data: obj as unknown as GeoJSONFeatureCollection };
}

export async function parseGeoJSONFile(file: File): Promise<GeoJSONValidationResult> {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    return validateGeoJSONCollection(json);
  } catch {
    return { ok: false, error: "Could not parse file as JSON." };
  }
}
