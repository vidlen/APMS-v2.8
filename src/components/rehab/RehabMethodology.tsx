import { ListOrdered } from "lucide-react";
import { REHAB_METHODOLOGY, REHAB_TRIGGER_PCI } from "@/lib/rehab";

export default function RehabMethodology() {
  return (
    <div className="px-5 py-5 border-b border-border">
      <div className="flex items-center gap-2 mb-3">
        <ListOrdered size={14} className="text-muted-foreground" />
        <h2 className="panel-label">Methodology</h2>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed mb-4">
        This plan is devised using four case studies, applied by current PCI - a branch at or below{" "}
        {REHAB_TRIGGER_PCI} triggers a treatment.
      </p>
      <ol>
        {REHAB_METHODOLOGY.map((row, i) => (
          <li key={row.treatment} className="hairline-row flex items-baseline gap-3 py-2">
            <span className="font-mono text-xs text-muted-foreground shrink-0 w-4">{i + 1}.</span>
            <span className="flex-1 min-w-0">
              <span className="text-foreground text-sm font-medium block">{row.treatment}</span>
              <span className="text-muted-foreground text-[11px] font-mono tabular-nums">
                PCI &le; {row.maxPci}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
