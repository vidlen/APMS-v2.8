import { Calendar } from "lucide-react";
import type { SurveyYear } from "@/lib/survey-years";
import { useData } from "@/lib/data-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SurveyYearSelectorProps {
  selectedYear: SurveyYear;
  onYearChange: (year: SurveyYear) => void;
}

// A global scope control — the map, Overview, Needs Attention, the sections
// table, and the detail panel are all downstream of it — so it lives in the
// header (which never unmounts) rather than inside the sidebar's swappable
// panels. It previously lived inside Legend, which unmounts on section
// selection and made the year unreachable in the app's most common state.
export default function SurveyYearSelector({
  selectedYear,
  onYearChange,
}: SurveyYearSelectorProps) {
  const { years } = useData();
  return (
    <Select value={selectedYear} onValueChange={(value) => onYearChange(value as SurveyYear)}>
      <SelectTrigger
        title="Survey year"
        size="sm"
        className="bg-secondary border-border text-foreground gap-1.5 text-[12.5px]"
      >
        <Calendar size={14} className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {years.map((year) => (
          <SelectItem key={year.id} value={year.id}>
            {year.label}
            {!year.hasData && <span className="text-muted-foreground"> (Coming Soon)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
