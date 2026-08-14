import type { KeyboardEvent } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useData, useEffectiveYearData } from "@/lib/data-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SampleUnitTableProps {
  year: string;
  section: string;
  onClose: () => void;
}

function saveOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

export default function SampleUnitTable({ year, section, onClose }: SampleUnitTableProps) {
  const { unitsBySection, loading } = useEffectiveYearData(year);
  const { setUnitScore } = useData();
  const fc = unitsBySection[section];

  const handleSave = (unitId: number, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const num = Number(trimmed);
    if (Number.isNaN(num) || num < 0 || num > 100) {
      toast.error("PCI must be a number between 0 and 100");
      return;
    }
    setUnitScore(year, section, unitId, num);
  };

  const units = fc
    ? [...fc.features].sort(
        (a, b) => (a.properties["sampleUnit"] as number) - (b.properties["sampleUnit"] as number)
      )
    : [];

  return (
    <div className="panel-surface rounded-lg mt-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">
          Sample Units — {section} <span className="text-muted-foreground font-normal">({year})</span>
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
          <X size={14} />
        </Button>
      </div>
      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        {loading || !fc ? (
          <p className="text-muted-foreground text-sm px-4 py-6">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Unit</TableHead>
                <TableHead className="text-right">PCI Score</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((f) => {
                const unitId = f.properties["sampleUnit"] as number;
                const score = f.properties["pci_score"] as number;
                const rating = f.properties["pci_rating"] as string;
                return (
                  <TableRow key={unitId}>
                    <TableCell className="tabular-nums text-foreground">{unitId}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        key={`${year}-${section}-${unitId}-${score}`}
                        defaultValue={score}
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        className="h-8 w-24 ml-auto text-right tabular-nums"
                        onBlur={(e) => handleSave(unitId, e.target.value)}
                        onKeyDown={saveOnEnter}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{rating}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
