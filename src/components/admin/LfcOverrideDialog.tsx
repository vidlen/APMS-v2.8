import { useState } from "react";
import { toast } from "sonner";
import type { LfcOverride } from "@/lib/data-overrides";
import { LIKELIHOOD_SCALE, FREQUENCY_SCALE, CONSEQUENCE_SCALE } from "@/config/riskScales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SlidersHorizontal } from "lucide-react";

interface LfcOverrideDialogProps {
  branchName: string;
  /** The engine's own value for this branch, ignoring any lfcOverride - shown beside each field per backlog L. */
  computed: { likelihood: number; frequency: number; consequence: number };
  current?: LfcOverride;
  onSave: (override: LfcOverride) => void;
  onClear: () => void;
}

// Radix Select items can't take an empty-string value.
const USE_COMPUTED = "__computed__";

function FactorField({
  label,
  scale,
  computedValue,
  value,
  onChange,
}: {
  label: string;
  scale: ReadonlyArray<{ value: number; label: string }>;
  computedValue: number;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label} <span className="text-muted-foreground font-normal">(computed: {computedValue})</span>
      </Label>
      <Select
        value={value === undefined ? USE_COMPUTED : String(value)}
        onValueChange={(v) => onChange(v === USE_COMPUTED ? undefined : Number(v))}
      >
        <SelectTrigger size="sm" className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={USE_COMPUTED}>Use computed ({computedValue})</SelectItem>
          {scale.map((s) => (
            <SelectItem key={s.value} value={String(s.value)}>
              {s.value} &mdash; {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function LfcOverrideDialog({
  branchName,
  computed,
  current,
  onSave,
  onClear,
}: LfcOverrideDialogProps) {
  const [open, setOpen] = useState(false);
  const [likelihood, setLikelihood] = useState<number | undefined>(current?.likelihood);
  const [frequency, setFrequency] = useState<number | undefined>(current?.frequency);
  const [consequence, setConsequence] = useState<number | undefined>(current?.consequence);
  const [note, setNote] = useState(current?.note ?? "");
  const [setBy, setSetBy] = useState(current?.setBy ?? "");

  const hasOverride = Boolean(current && Object.keys(current).length > 0);

  const handleOpenChange = (next: boolean) => {
    // Radix unmounts DialogContent on close, so a fresh open always starts
    // from the currently-saved override rather than a stale draft - reset
    // explicitly here anyway since these are plain useState, not derived.
    if (next) {
      setLikelihood(current?.likelihood);
      setFrequency(current?.frequency);
      setConsequence(current?.consequence);
      setNote(current?.note ?? "");
      setSetBy(current?.setBy ?? "");
    }
    setOpen(next);
  };

  const handleSave = () => {
    const noteTrimmed = note.trim();
    const setByTrimmed = setBy.trim();
    const nothingSet =
      likelihood === undefined && frequency === undefined && consequence === undefined &&
      !noteTrimmed && !setByTrimmed;

    if (nothingSet) {
      onClear();
      toast.success(`${branchName}: no override set`);
      setOpen(false);
      return;
    }

    onSave({
      likelihood,
      frequency,
      consequence,
      note: noteTrimmed || undefined,
      setBy: setByTrimmed || undefined,
      setOn: new Date().toISOString().slice(0, 10),
    });
    toast.success(`${branchName}: override saved`);
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    toast.success(`${branchName}: override cleared`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={hasOverride ? "secondary" : "outline"} size="sm" className="h-8">
          <SlidersHorizontal size={13} />
          {hasOverride ? "Overridden" : "Override"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branchName} &mdash; override L, F, C</DialogTitle>
          <DialogDescription>
            An expert override replaces the engine's computed value outright. Leave a field at "Use computed"
            to keep the engine's own number.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FactorField
            label="Likelihood (L)"
            scale={LIKELIHOOD_SCALE}
            computedValue={computed.likelihood}
            value={likelihood}
            onChange={setLikelihood}
          />
          <FactorField
            label="Frequency (F)"
            scale={FREQUENCY_SCALE}
            computedValue={computed.frequency}
            value={frequency}
            onChange={setFrequency}
          />
          <FactorField
            label="Consequence (C)"
            scale={CONSEQUENCE_SCALE}
            computedValue={computed.consequence}
            value={consequence}
            onChange={setConsequence}
          />
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="lfc-note">
              Note
            </Label>
            <Textarea
              id="lfc-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this overrides the computed value"
              className="text-xs min-h-16"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="lfc-set-by">
              Set by
            </Label>
            <Input
              id="lfc-set-by"
              value={setBy}
              onChange={(e) => setSetBy(e.target.value)}
              placeholder="Name"
              className="h-8 text-xs"
            />
          </div>
          {current?.setOn && (
            <p className="text-[11px] text-muted-foreground">Last set {current.setOn}</p>
          )}
        </div>

        <DialogFooter>
          {hasOverride && (
            <Button variant="ghost" onClick={handleClear}>
              Clear override
            </Button>
          )}
          <Button onClick={handleSave}>Save override</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
