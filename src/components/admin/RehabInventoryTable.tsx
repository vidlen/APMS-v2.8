import { useMemo } from "react";
import { toast } from "sonner";
import { usePavementData } from "@/hooks/usePavementData";
import { useData } from "@/lib/data-store";
import {
  computeRehabPlan,
  REHAB_TREATMENTS,
  REHAB_YEARS,
  type RehabTreatment,
  type RehabYear,
} from "@/lib/rehab";
import type { SectionRehabOverride } from "@/lib/data-overrides";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RotateCcw } from "lucide-react";

interface RehabInventoryTableProps {
  year: string;
}

// Stable reference for years with no admin-entered rehab overrides yet, so
// `?? EMPTY_REHAB_META` doesn't hand computeRehabPlan a fresh object
// identity on every render.
const EMPTY_REHAB_META: Record<string, SectionRehabOverride> = {};

export default function RehabInventoryTable({ year }: RehabInventoryTableProps) {
  const { sections, loading } = usePavementData(year);
  const { overrides, setSectionRehab } = useData();
  const overridesForYear = overrides.sectionRehab[year] ?? EMPTY_REHAB_META;

  const plan = useMemo(() => computeRehabPlan(sections, overridesForYear), [sections, overridesForYear]);

  if (loading) {
    return <p className="text-muted-foreground text-sm px-4 py-6">Loading…</p>;
  }

  if (sections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm px-4 py-6">
        No data for {year} yet — import a GeoJSON or clone another year from Survey Years first.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Section</TableHead>
          <TableHead>PCI</TableHead>
          <TableHead>Treatment</TableHead>
          <TableHead>Priority year</TableHead>
          <TableHead title="Placeholder estimate for demonstration only — not a real cost projection">
            Funds needed (IDR)
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.map((item) => {
          const override = overridesForYear[item.section.Section] ?? {};
          const hasOverride = Object.keys(override).length > 0;

          return (
            <TableRow key={item.section.Section}>
              <TableCell className="font-medium text-foreground whitespace-nowrap">
                {item.section.Section}
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                {item.section["PCI Rating"]}
              </TableCell>
              <TableCell>
                <Select
                  value={item.treatment}
                  onValueChange={(value) =>
                    setSectionRehab(year, item.section.Section, { treatment: value as RehabTreatment })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REHAB_TREATMENTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={item.priorityYear}
                  onValueChange={(value) =>
                    setSectionRehab(year, item.section.Section, { priorityYear: value as RehabYear })
                  }
                >
                  <SelectTrigger size="sm" className="h-8 w-full min-w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REHAB_YEARS.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  key={`${year}-${item.section.Section}-${item.costIdr}`}
                  defaultValue={item.costIdr}
                  className="h-8 w-40 tabular-nums"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) return;
                    const num = Number(raw);
                    if (!Number.isFinite(num) || num < 0) {
                      toast.error("Funds needed must be a non-negative number");
                      return;
                    }
                    setSectionRehab(year, item.section.Section, { costIdr: num });
                  }}
                />
              </TableCell>
              <TableCell>
                {hasOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Clear overrides for this branch — revert to computed defaults"
                    onClick={() =>
                      setSectionRehab(year, item.section.Section, {
                        treatment: undefined,
                        priorityYear: undefined,
                        costIdr: undefined,
                      })
                    }
                  >
                    <RotateCcw size={13} />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
