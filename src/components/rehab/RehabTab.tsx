import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SectionData } from "@/lib/pci-utils";
import type { SurveyYear } from "@/lib/survey-years";
import { computeRehabPlan, REHAB_YEARS, type RehabPlanItem, type RehabYear } from "@/lib/rehab";
import type { SectionRehabOverride } from "@/lib/data-overrides";
import { useData } from "@/lib/data-store";
import { useNarrowViewport } from "@/hooks/useNarrowViewport";
import MapView from "@/components/MapView";
import RehabStatsBar from "./RehabStatsBar";
import RehabMethodology from "./RehabMethodology";
import RehabPriorityList from "./RehabPriorityList";
import RehabLegend from "./RehabLegend";
import RehabDetailPanel from "./RehabDetailPanel";
import RehabPlanTable from "./RehabPlanTable";

interface RehabTabProps {
  sections: SectionData[];
  selectedYear: SurveyYear;
}

function noop() {}

// Stable reference for years with no admin-entered rehab overrides, so
// `?? EMPTY_REHAB_META` doesn't hand computeRehabPlan a fresh object
// identity on every render and force it to recompute the whole plan.
const EMPTY_REHAB_META: Record<string, SectionRehabOverride> = {};

export default function RehabTab({ sections, selectedYear }: RehabTabProps) {
  const { overrides } = useData();
  const rehabOverrides = overrides.sectionRehab[selectedYear] ?? EMPTY_REHAB_META;

  // Same responsive shell as the PCI tab (src/pages/Home.tsx): docked
  // sidebar on desktop, full-width overlay under the narrow breakpoint.
  const isNarrow = useNarrowViewport();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isNarrow);
  const [selectedSection, setSelectedSection] = useState<SectionData | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [activeYears, setActiveYears] = useState<Set<RehabYear>>(new Set());

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const plan = useMemo(() => computeRehabPlan(sections, rehabOverrides), [sections, rehabOverrides]);
  const planBySection = useMemo(() => {
    const map: Record<string, RehabPlanItem> = {};
    for (const item of plan) map[item.section.Section] = item;
    return map;
  }, [plan]);
  const yearCounts = useMemo(() => {
    const counts = REHAB_YEARS.reduce(
      (acc, y) => {
        acc[y] = 0;
        return acc;
      },
      {} as Record<RehabYear, number>
    );
    for (const item of plan) counts[item.priorityYear] += 1;
    return counts;
  }, [plan]);

  const handleFeatureClick = useCallback((section: SectionData | null) => {
    setSelectedSection(section);
  }, []);

  const handleToggleYear = useCallback((year: RehabYear) => {
    setActiveYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  const handleClearYears = useCallback(() => setActiveYears(new Set()), []);

  const selectedItem = selectedSection ? planBySection[selectedSection.Section] : undefined;

  const sidebarWidth = isNarrow
    ? viewportWidth
    : showTable
      ? Math.max(Math.round(viewportWidth / 3), 450)
      : 320;
  const toggleAtLeftEdge = isNarrow && !sidebarCollapsed;

  return (
    <div className="relative flex-1 flex min-h-0">
      {/* Map */}
      <div className="relative flex-1 min-w-0">
        <MapView
          key={selectedYear}
          selectedYear={selectedYear}
          onFeatureClick={handleFeatureClick}
          selectedSection={selectedSection}
          detailedSection={null}
          onExitDetails={noop}
          activeBands={new Set()}
          onClearBands={noop}
          colorMode="rehab"
          rehabByBranch={planBySection}
        />

        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          <div className="flex justify-end px-3 pb-1">
            <p className="text-[11px] text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0_/_0.7)]">
              5-Year Rehabilitation Plan
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        className={`absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-6 h-12 bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-primary ${
          toggleAtLeftEdge ? "rounded-r-md" : "rounded-l-md"
        }`}
        style={toggleAtLeftEdge ? { left: 0 } : { right: sidebarCollapsed ? 0 : sidebarWidth }}
        title={sidebarCollapsed ? "Show panel" : "Hide panel"}
        aria-label={sidebarCollapsed ? "Show panel" : "Hide panel"}
      >
        {sidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Docked sidebar */}
      <aside
        className="relative shrink-0 bg-card border-l border-border overflow-hidden"
        style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
      >
        <div
          className="h-full overflow-y-auto custom-scrollbar pb-[env(safe-area-inset-bottom)]"
          style={{ width: sidebarWidth }}
        >
          {showTable ? (
            <RehabPlanTable
              plan={plan}
              activeYears={activeYears}
              onClearYears={handleClearYears}
              selectedSection={selectedSection}
              onSelect={handleFeatureClick}
              onClose={() => setShowTable(false)}
            />
          ) : selectedItem ? (
            <RehabDetailPanel item={selectedItem} onClose={() => setSelectedSection(null)} />
          ) : (
            <>
              <RehabStatsBar plan={plan} onOpenTable={() => setShowTable(true)} />
              <RehabMethodology />
              <RehabPriorityList plan={plan} onSelect={handleFeatureClick} onShowAll={() => setShowTable(true)} />
              <RehabLegend
                activeYears={activeYears}
                onToggleYear={handleToggleYear}
                onClearYears={handleClearYears}
                yearCounts={yearCounts}
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
