import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Download, Upload, RotateCcw } from "lucide-react";
import { useData, useSectionsWithUnits, useEffectiveYearData } from "@/lib/data-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { downloadJson, sectionsFileName, unitsFileName, parseGeoJSONFile } from "@/lib/geojson-io";

interface ImportExportPanelProps {
  year: string;
}

export default function ImportExportPanel({ year }: ImportExportPanelProps) {
  const { importSectionsGeoJSON, importUnitsGeoJSON, resetDrafts } = useData();
  const { sectionsFC, unitsBySection } = useEffectiveYearData(year);
  const sectionsWithUnits = useSectionsWithUnits(year);

  const sectionsFileInput = useRef<HTMLInputElement>(null);
  const unitsFileInput = useRef<HTMLInputElement>(null);
  const [unitsSectionName, setUnitsSectionName] = useState("");

  const handleDownloadSections = () => {
    if (!sectionsFC) {
      toast.error("No section data to export for this year yet.");
      return;
    }
    downloadJson(sectionsFileName(year), sectionsFC);
  };

  const handleDownloadUnits = (section: string) => {
    const fc = unitsBySection[section];
    if (!fc) {
      toast.error(`No sample-unit data to export for ${section} yet.`);
      return;
    }
    downloadJson(unitsFileName(year, section), fc);
  };

  const handleImportSectionsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await parseGeoJSONFile(file);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    importSectionsGeoJSON(year, result.data);
    toast.success(`Imported section geometry for ${year}`);
  };

  const handleImportUnitsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const section = unitsSectionName.trim();
    if (!section) {
      toast.error("Enter a section name (e.g. 06/24) before importing units.");
      return;
    }
    const result = await parseGeoJSONFile(file);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    importUnitsGeoJSON(year, section, result.data);
    toast.success(`Imported sample units for ${section} (${year})`);
  };

  return (
    <div className="panel-surface rounded-lg p-4 space-y-5">
      <h2 className="text-sm font-bold text-foreground">Import / Export — {year}</h2>

      <div className="space-y-2">
        <p className="panel-label">Export (download the committed JSON files)</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleDownloadSections}>
            <Download size={13} />
            {sectionsFileName(year)}
          </Button>
          {sectionsWithUnits.map((section) => (
            <Button
              key={section}
              variant="secondary"
              size="sm"
              onClick={() => handleDownloadUnits(section)}
            >
              <Download size={13} />
              {unitsFileName(year, section)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="panel-label">Import GeoJSON (EPSG:4326 / CRS84 only)</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => sectionsFileInput.current?.click()}>
            <Upload size={13} />
            Upload sections
          </Button>
          <input
            ref={sectionsFileInput}
            type="file"
            accept=".json,.geojson,application/json,application/geo+json"
            className="hidden"
            onChange={handleImportSectionsFile}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Section name, e.g. 06/24"
            value={unitsSectionName}
            onChange={(e) => setUnitsSectionName(e.target.value)}
            className="h-8 w-44"
          />
          <Button variant="outline" size="sm" onClick={() => unitsFileInput.current?.click()}>
            <Upload size={13} />
            Upload sample units
          </Button>
          <input
            ref={unitsFileInput}
            type="file"
            accept=".json,.geojson,application/json,application/geo+json"
            className="hidden"
            onChange={handleImportUnitsFile}
          />
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <RotateCcw size={13} />
              Reset all drafts
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all admin drafts?</AlertDialogTitle>
              <AlertDialogDescription>
                This discards every unsaved edit, added year, and import across all survey years in
                this browser, and reverts to the committed data. Export anything you want to keep
                first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  resetDrafts();
                  toast.success("Drafts reset");
                }}
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
