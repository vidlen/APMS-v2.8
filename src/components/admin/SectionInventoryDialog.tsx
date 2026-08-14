import { useState } from "react";
import { toast } from "sonner";
import type { SectionInventoryOverride } from "@/lib/data-overrides";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface SectionInventoryDialogProps {
  section: string;
  /** The row's current effective values (override, or the base GeoJSON value if none). */
  current: { dimension: string; lastMajorConstructionYear: string };
  override?: SectionInventoryOverride;
  onSave: (patch: SectionInventoryOverride) => void;
  onClear: () => void;
}

export default function SectionInventoryDialog({
  section,
  current,
  override,
  onSave,
  onClear,
}: SectionInventoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState(current.dimension);
  const [year, setYear] = useState(current.lastMajorConstructionYear);

  const hasOverride = Boolean(
    override && (override.Dimension !== undefined || override["Last Major Construction Year"] !== undefined)
  );

  const handleOpenChange = (next: boolean) => {
    // Radix unmounts DialogContent on close, so reset the draft to the
    // currently-effective values on every fresh open (see LfcOverrideDialog).
    if (next) {
      setDimension(current.dimension);
      setYear(current.lastMajorConstructionYear);
    }
    setOpen(next);
  };

  const handleSave = () => {
    // A field cleared back to blank means "stop overriding this field", not
    // "save it as blank".
    const patch: SectionInventoryOverride = {
      Dimension: dimension.trim() || undefined,
      "Last Major Construction Year": year.trim() || undefined,
    };

    if (Object.values(patch).every((v) => v === undefined)) {
      onClear();
      toast.success(`${section}: reverted to source data`);
      setOpen(false);
      return;
    }

    onSave(patch);
    toast.success(`${section}: details updated`);
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    toast.success(`${section}: reverted to source data`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={hasOverride ? "secondary" : "outline"} size="sm" className="h-8">
          <Pencil size={13} />
          {hasOverride ? "Edited" : "Edit details"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{section}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="inv-dimension">
              Dimension
            </Label>
            <Input
              id="inv-dimension"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="inv-year">
              Last major construction year
            </Label>
            <Input id="inv-year" value={year} onChange={(e) => setYear(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <DialogFooter>
          {hasOverride && (
            <Button variant="ghost" onClick={handleClear}>
              Revert to source
            </Button>
          )}
          <Button onClick={handleSave}>Save details</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
