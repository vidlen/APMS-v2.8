import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Style, Fill, Stroke, Text } from "ol/style";
import { Zoom, Attribution } from "ol/control";
import type { FeatureLike } from "ol/Feature";
import type { SectionData } from "@/lib/pci-utils";
import { getPCIStyle, getPCICategory, parsePCIValue } from "@/lib/pci-utils";
import { useEffectiveYearData } from "@/lib/data-store";
import type { SurveyYear } from "@/lib/survey-years";
import type { BranchRiskResult } from "@/lib/risk";
import type { RehabPlanItem } from "@/lib/rehab";
import "ol/ol.css";

/** Which ramp colors the base polygons. 'pci' is the only mode outside the Risk/Rehab tabs. */
export type MapColorMode = "pci" | "icao" | "fk" | "rehab";

interface MapViewProps {
  selectedYear: SurveyYear;
  onFeatureClick: (section: SectionData | null) => void;
  selectedSection: SectionData | null;
  detailedSection: string | null;
  onExitDetails: () => void;
  activeBands: Set<string>;
  onClearBands: () => void;
  /** Defaults to 'pci' - every call site before the Risk tab relied on that being the only mode. */
  colorMode?: MapColorMode;
  /** Only read when colorMode is 'icao' or 'fk'. Keyed by branch Section name (brief backlog F). */
  riskByBranch?: Record<string, BranchRiskResult>;
  /** Only read when colorMode is 'rehab'. Keyed by branch Section name, same pattern as riskByBranch. */
  rehabByBranch?: Record<string, RehabPlanItem>;
}

const GEOJSON_PROJECTION_OPTS = {
  dataProjection: "EPSG:4326",
  featureProjection: "EPSG:3857",
};

// Re-expresses an rgba() color string at a different alpha — used to dim
// sections that don't match the legend's active condition filter.
function withAlpha(rgba: string, alpha: number): string {
  const match = rgba.match(/rgba?\(([^)]+)\)/);
  if (!match) return rgba;
  const [r, g, b] = match[1].split(",").map((p) => p.trim());
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// RISK_BANDS/ICAO_ZONES colors are plain hex (#rrggbb); the map fill needs
// the same translucency as the PCI ramp's rgba fills, so branches on the
// satellite basemap read the same way regardless of which ramp is active.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Fallback fill for a branch missing from riskByBranch. Shouldn't happen in
// practice (every branch scores - see risk-adapter.ts), but the map must not
// throw if a race between tab-switch and re-scoring briefly leaves a gap.
const RISK_FALLBACK_COLOR = "#9ca3af";

export default function MapView({
  selectedYear,
  onFeatureClick,
  selectedSection,
  detailedSection,
  onExitDetails,
  activeBands,
  onClearBands,
  colorMode = "pci",
  riskByBranch,
  rehabByBranch,
}: MapViewProps) {
  const { sectionsFC, unitsBySection } = useEffectiveYearData(selectedYear);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const vectorLayerRef = useRef<VectorLayer | null>(null);
  const baseSourceRef = useRef<VectorSource | null>(null);
  const unitsLayerRef = useRef<VectorLayer | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const detailedSectionRef = useRef<string | null>(null);
  // The pointermove handler below is registered once, inside the mount-only
  // effect (empty deps, same as detailedSectionRef's reason for existing) -
  // colorMode/riskByBranch can change after mount when the ramp toggle is
  // used, so the tooltip reads them through refs rather than closing over
  // stale values.
  const colorModeRef = useRef<MapColorMode>(colorMode);
  const riskByBranchRef = useRef<Record<string, BranchRiskResult> | undefined>(riskByBranch);
  const rehabByBranchRef = useRef<Record<string, RehabPlanItem> | undefined>(rehabByBranch);

  useEffect(() => {
    detailedSectionRef.current = detailedSection;
  }, [detailedSection]);

  useEffect(() => {
    colorModeRef.current = colorMode;
    riskByBranchRef.current = riskByBranch;
    rehabByBranchRef.current = rehabByBranch;
  }, [colorMode, riskByBranch, rehabByBranch]);

  // Style function for base pavement features
  const styleFunction = useCallback(
    (feature: FeatureLike) => {
      const props = feature.getProperties();
      const sectionName = props["Section"] as string;
      const isSelected = selectedSection?.Section === sectionName;
      const isDetailedThis = detailedSection === sectionName;

      if (isDetailedThis) {
        // Hide the base polygon for the section that's being shown in detail
        return new Style({});
      }

      if (colorMode !== "pci") {
        // Risk/Rehab color modes: the ramp color is looked up per branch. No
        // PCI band dimming here - `activeBands` is a PCI-tab-only filter
        // concept and neither the Risk nor Rehab tab sets it.
        let hex: string;
        if (colorMode === "rehab") {
          hex = rehabByBranch?.[sectionName]?.color ?? RISK_FALLBACK_COLOR;
        } else {
          const result = riskByBranch?.[sectionName];
          hex = result ? (colorMode === "icao" ? result.icao.zoneColor : result.band.color) : RISK_FALLBACK_COLOR;
        }
        return new Style({
          fill: new Fill({ color: hexToRgba(hex, 0.72) }),
          stroke: new Stroke({
            color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(35,35,35,0.7)",
            width: isSelected ? 2.5 : 1,
          }),
        });
      }

      const pciValue = parsePCIValue(props["PCI Rating"] || "0");
      const style = getPCIStyle(pciValue);

      // When the legend filter is active, dim sections outside the chosen
      // condition band(s) so the matching ones stand out. Selection always
      // wins over dimming, so a selected section stays fully highlighted.
      const category = getPCICategory(pciValue);
      const isDimmed = activeBands.size > 0 && !activeBands.has(category.label);

      return new Style({
        fill: new Fill({
          color: isDimmed ? withAlpha(style.fill, 0.12) : style.fill,
        }),
        stroke: new Stroke({
          color: isSelected
            ? "rgba(255,255,255,0.95)"
            : isDimmed
              ? "rgba(35,35,35,0.25)"
              : style.stroke,
          width: isSelected ? 2.5 : style.strokeWidth,
        }),
      });
    },
    [selectedSection, detailedSection, activeBands, colorMode, riskByBranch, rehabByBranch]
  );

  // Style function for sample-unit features
  const unitStyleFunction = useCallback(
    (feature: FeatureLike) => {
      const props = feature.getProperties();
      const pciValue = Number(props["pci_score"]);
      const style = getPCIStyle(pciValue);
      const isSelected =
        selectedSection?.sampleUnit === props["sampleUnit"] &&
        selectedSection?.Section === detailedSection;
      return new Style({
        fill: new Fill({ color: style.fill }),
        stroke: new Stroke({
          color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(20,20,20,0.85)",
          width: isSelected ? 2.2 : 0.8,
        }),
        text: new Text({
          text: String(props["sampleUnit"] ?? ""),
          font: '600 10px "Fira Sans", system-ui, sans-serif',
          fill: new Fill({ color: "#111" }),
          stroke: new Stroke({ color: "rgba(255,255,255,0.85)", width: 2 }),
          overflow: false,
        }),
      });
    },
    [selectedSection, detailedSection]
  );

  useEffect(() => {
    if (!mapRef.current) return;

    // Vector source starts empty; features are populated in-memory from the
    // data store once the effective (base + admin overrides) data resolves.
    const vectorSource = new VectorSource();

    // Create vector layer
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: styleFunction,
      declutter: true,
    });
    vectorLayerRef.current = vectorLayer;
    baseSourceRef.current = vectorSource;

    // Create map
    const map = new Map({
      target: mapRef.current,
      layers: [
        // Google Satellite base
        new TileLayer({
          source: new XYZ({
            url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            attributions: "Google Satellite",
          }),
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([106.66, -6.12]),
        zoom: 14,
        maxZoom: 19,
        minZoom: 11,
      }),
      controls: [],
    });
    mapInstance.current = map;

    // Add zoom controls
    map.addControl(new Zoom());

    // Add attribution
    map.addControl(new Attribution({ collapsed: true }));

    // Click handler
    map.on("click", (e) => {
      const feature = map.forEachFeatureAtPixel(e.pixel, (f) => f);
      if (feature) {
        const props = feature.getProperties();
        if (props["sampleUnit"] !== undefined) {
          // Sample-unit click: open the same detail panel, inheriting
          // PCN/Type from the parent runway section (sample units share
          // a single PCN — only PCI is measured per sample unit).
          const parentSectionName = detailedSectionRef.current;
          const baseSource = baseSourceRef.current;
          const parentFeature =
            parentSectionName && baseSource
              ? baseSource
                  .getFeatures()
                  .find((f) => f.get("Section") === parentSectionName)
              : undefined;
          const parentProps = parentFeature?.getProperties();
          const pciScore = Number(props["pci_score"]);
          const pciRatingStr = Number.isInteger(pciScore)
            ? String(pciScore)
            : pciScore.toFixed(2);

          onFeatureClick({
            Section: parentSectionName ?? "",
            "PCI Rating": pciRatingStr,
            PCN: (parentProps?.["PCN"] as string) ?? "",
            Type: (parentProps?.["Type"] as string) ?? "",
            sampleUnit: props["sampleUnit"] as number,
            "Last Major Construction Year": parentProps?.["Last Major Construction Year"] as string | undefined,
            Dimension: parentProps?.["Dimension"] as string | undefined,
          });
          return;
        }
        onFeatureClick({
          Section: props["Section"],
          "PCI Rating": props["PCI Rating"],
          PCN: props["PCN"],
          Type: props["Type"],
          "Last Major Construction Year": props["Last Major Construction Year"],
          Dimension: props["Dimension"],
        });
      } else {
        onFeatureClick(null);
      }
    });

    // Hover handler for cursor and tooltip
    const tooltipEl = document.createElement("div");
    tooltipEl.className = "map-tooltip";
    tooltipEl.style.display = "none";
    document.body.appendChild(tooltipEl);
    tooltipRef.current = tooltipEl;

    map.on("pointermove", (e) => {
      const pixel = map.getEventPixel(e.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (f) => f);

      if (feature) {
        const props = feature.getProperties();
        map.getViewport().style.cursor = "pointer";
        tooltipEl.style.display = "block";
        if (props["sampleUnit"] !== undefined) {
          // Sample units are only ever shown under the PCI ramp (drilling
          // into a runway's units isn't part of the risk register), so this
          // stays PCI-labeled regardless of colorModeRef.
          const pciValue = Number(props["pci_score"]);
          const label = getPCICategory(pciValue).label;
          tooltipEl.innerHTML = `<strong>Sample Unit <span class="font-mono">${props["sampleUnit"]}</span></strong> &middot; PCI: <span class="font-mono">${pciValue.toFixed(2)}</span> &middot; ${label}`;
        } else if (colorModeRef.current === "rehab") {
          const sectionName = props["Section"];
          const item = rehabByBranchRef.current?.[sectionName];
          tooltipEl.innerHTML = item
            ? `<strong class="font-mono">${sectionName}</strong> &middot; ${item.priorityYear} &middot; ${item.treatment}`
            : `<strong class="font-mono">${sectionName}</strong>`;
        } else if (colorModeRef.current !== "pci") {
          const sectionName = props["Section"];
          const result = riskByBranchRef.current?.[sectionName];
          tooltipEl.innerHTML = result
            ? `<strong class="font-mono">${sectionName}</strong> &middot; R <span class="font-mono">${result.riskScore.toFixed(1)}</span> &middot; ${result.icao.cell} ${result.icao.zone}`
            : `<strong class="font-mono">${sectionName}</strong>`;
        } else {
          const sectionName = props["Section"];
          const pci = props["PCI Rating"];
          const label = getPCICategory(parsePCIValue(pci)).label;
          tooltipEl.innerHTML = `<strong class="font-mono">${sectionName}</strong> &middot; PCI: <span class="font-mono">${pci}</span> &middot; ${label}`;
        }
        const evt = e.originalEvent as PointerEvent;
        tooltipEl.style.left = evt.pageX + 12 + "px";
        tooltipEl.style.top = evt.pageY - 30 + "px";
      } else {
        map.getViewport().style.cursor = "";
        tooltipEl.style.display = "none";
      }
    });

    // Cleanup
    return () => {
      map.setTarget(undefined);
      if (tooltipEl && tooltipEl.parentNode) {
        tooltipEl.parentNode.removeChild(tooltipEl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate/refresh the base layer whenever the effective section data
  // (base file + admin overrides) resolves or changes.
  useEffect(() => {
    const source = baseSourceRef.current;
    if (!source || !sectionsFC) return;
    const features = new GeoJSON().readFeatures(sectionsFC, GEOJSON_PROJECTION_OPTS);
    source.clear();
    source.addFeatures(features);
  }, [sectionsFC]);

  // Update styles when selection changes
  useEffect(() => {
    if (vectorLayerRef.current) {
      vectorLayerRef.current.setStyle(styleFunction);
    }
  }, [selectedSection, styleFunction]);

  // Fly the view to the selected section so it's always visible after being
  // picked from search, Needs Attention, or the map itself. Skipped for a
  // sample-unit selection — its parent section is already framed.
  useEffect(() => {
    const map = mapInstance.current;
    const source = baseSourceRef.current;
    if (!map || !source) return;
    if (!selectedSection || selectedSection.sampleUnit !== undefined) return;

    const feature = source
      .getFeatures()
      .find((f) => f.get("Section") === selectedSection.Section);
    const geometry = feature?.getGeometry();
    if (!geometry) return;

    map.getView().fit(geometry.getExtent(), {
      duration: 500,
      padding: [60, 60, 60, 60],
      maxZoom: 15,
    });
  }, [selectedSection]);

  // Manage the sample-unit layer when detailedSection (or its effective
  // data — e.g. after an admin edits a unit score) changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Tear down any previous units layer
    if (unitsLayerRef.current) {
      map.removeLayer(unitsLayerRef.current);
      unitsLayerRef.current = null;
    }

    if (!detailedSection) return;

    const fc = unitsBySection[detailedSection];
    if (!fc) return;

    const source = new VectorSource({
      features: new GeoJSON().readFeatures(fc, GEOJSON_PROJECTION_OPTS),
    });

    const layer = new VectorLayer({
      source,
      style: unitStyleFunction,
      declutter: false,
      zIndex: 10,
    });
    unitsLayerRef.current = layer;
    map.addLayer(layer);
    // unitStyleFunction is applied by the effect below whenever it changes,
    // so it's intentionally excluded here to avoid rebuilding the
    // sample-unit layer on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailedSection, unitsBySection]);

  // Refresh sample-unit styling (e.g. selection highlight) without
  // recreating the layer or its data source
  useEffect(() => {
    if (unitsLayerRef.current) {
      unitsLayerRef.current.setStyle(unitStyleFunction);
    }
  }, [unitStyleFunction]);

  return (
    <>
      <div ref={mapRef} className="w-full h-full" />
      {detailedSection && (
        <button
          onClick={onExitDetails}
          className="panel-surface absolute top-24 left-3 z-30 flex items-center gap-2 hover:border-primary/40 text-foreground text-xs font-medium px-3 py-2 rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden>←</span>
          <span>Back to overview · {detailedSection}</span>
        </button>
      )}
      {/* Persistent condition-filter indicator — survives the sidebar
          swapping to the detail panel or table, where the legend that
          set this filter is no longer on screen. */}
      {activeBands.size > 0 && (
        <div className="panel-surface absolute top-3 right-3 z-30 flex items-center gap-2 px-3 py-2 rounded-md max-w-[260px]">
          <span className="text-[11px] text-muted-foreground shrink-0">Filtered:</span>
          <div className="flex items-center gap-1 flex-wrap min-w-0">
            {[...activeBands].map((label) => (
              <span
                key={label}
                className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium whitespace-nowrap"
              >
                {label}
              </span>
            ))}
          </div>
          <button
            onClick={onClearBands}
            aria-label="Clear condition filter"
            className="shrink-0 p-2 -m-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            title="Clear condition filter"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );
}
