export interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoJSONFeature {
  type: "Feature";
  id?: number;
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  name?: string;
  crs?: { type: string; properties: { name: string } };
  features: GeoJSONFeature[];
}
