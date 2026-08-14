import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "@/lib/data-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface YearManagerProps {
  selectedYear: string;
  onSelectYear: (year: string) => void;
}

const NO_CLONE = "__none__";

export default function YearManager({ selectedYear, onSelectYear }: YearManagerProps) {
  const { years, addYear, removeYear } = useData();
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [cloneFrom, setCloneFrom] = useState<string>(
    years.find((y) => y.hasData)?.id ?? NO_CLONE
  );
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Enter a year label");
      return;
    }
    if (years.some((y) => y.id === trimmed)) {
      toast.error("That year already exists");
      return;
    }
    const id = addYear({ label: trimmed, clonedFrom: cloneFrom === NO_CLONE ? null : cloneFrom });
    onSelectYear(id);
    setAddOpen(false);
    setLabel("");
    toast.success(`Added ${trimmed}`);
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    const id = pendingRemove;
    removeYear(id);
    setPendingRemove(null);
    if (selectedYear === id) {
      const next = years.find((y) => y.id !== id);
      if (next) onSelectYear(next.id);
    }
    toast.success(`Removed ${id}`);
  };

  return (
    <div className="panel-surface rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Survey Years</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">
              <Plus size={14} />
              Add Year
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Survey Year</DialogTitle>
              <DialogDescription>
                New years start by cloning another year's map geometry, so you only need to edit
                scores. You can also import a GeoJSON afterward from Import/Export.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="year-label">Year label</Label>
                <Input
                  id="year-label"
                  placeholder="e.g. 2026"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clone data from</Label>
                <Select value={cloneFrom} onValueChange={setCloneFrom}>
                  <SelectTrigger className="w-full bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {years
                      .filter((y) => y.hasData)
                      .map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.label}
                        </SelectItem>
                      ))}
                    <SelectItem value={NO_CLONE}>None (upload GeoJSON later)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} className="w-full">
                Add Year
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-1.5">
        {years.map((y) => (
          <div
            key={y.id}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              selectedYear === y.id
                ? "border-primary/40 bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                : "border-border bg-secondary/40"
            }`}
          >
            <button
              onClick={() => onSelectYear(y.id)}
              className="flex items-center gap-2 text-left flex-1 min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={`text-foreground ${selectedYear === y.id ? "font-bold" : "font-medium"}`}
              >
                {y.label}
              </span>
              {!y.hasData && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  No data
                </span>
              )}
              {y.clonedFrom && (
                <span className="text-[10px] text-muted-foreground">
                  cloned from {y.clonedFrom}
                </span>
              )}
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPendingRemove(y.id)}
              title="Remove year"
              aria-label={`Remove year ${y.label}`}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the year from the survey-year list and clears any edits or uploads made
              for it. Years cloned from it will fall back to showing no data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
