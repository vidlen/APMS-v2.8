import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { DOMINANT_DISTRESS_METRIC } from "@/config/riskScales";
import { REHAB_METHODOLOGY, REHAB_TRIGGER_PCI } from "@/lib/rehab";

// Alberti Table 12's PCI-triggered treatment ladder, transcribed once here
// for the comparison below - not imported, because it belongs to a road PMS
// this app has no dependency on. REHAB_METHODOLOGY (rehab.ts) is the real,
// live config; this is read-only reference data for the citation.
//
// Ordered most-severe-first to match REHAB_METHODOLOGY's own order (its
// comment: "most severe first so a branch matches exactly one row") - zipping
// the two arrays by index only lines up the right rows if both start from the
// same end of the severity scale.
const ALBERTI_TABLE_12 = [
  { treatment: "Major rehabilitation", pciRange: "0–50" },
  { treatment: "Minor rehabilitation", pciRange: "51–72" },
  { treatment: "Routine maintenance", pciRange: "73–84" },
  { treatment: "Preventive maintenance", pciRange: "85–92" },
];

const METRIC_LABEL: Record<string, string> = {
  count: "record count",
  area: "affected area",
  severity_area: "severity x area",
};

// Section 8 (riskScales.ts) plus rehab.ts's own treatment ladder, read out as
// prose rather than as a second bibliography - the citations themselves live
// as comments in the config files, this panel is the "why" a defence would
// actually be asked about.
export default function RiskMethodologyPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-secondary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2">
          <BookOpen size={14} className="text-muted-foreground shrink-0" />
          <span className="panel-label">Methodology &amp; literature</span>
        </span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 text-xs text-muted-foreground leading-relaxed">
          <p>
            Likelihood comes from the Markov/PCI forecast tiers (<code className="font-mono">risk.ts</code>).
            Frequency comes from operational role. Consequence comes from distress types recorded in
            the airport&apos;s own repair log - 678 dated records over 2025-08-30 to 2026-02-26 - mapped to
            failure modes following Pasindu (2011) and weighted by severity and extent, the closest
            analogue available to an ASTM D5340 deduct value when none is recorded.
          </p>

          <div>
            <p className="text-foreground font-semibold text-[11px] uppercase tracking-wide mb-2">
              Three limits, stated rather than buried
            </p>
            <ul className="space-y-2 list-disc pl-4">
              <li>
                Coverage stops at 31 of 75 branches. The log&apos;s own header reads &quot;Unit: North
                Runway&quot;, so the remaining branches are a scope boundary in the source data, not a
                fault in the join - see the coverage panel above for which of the 44 have no repair
                recorded versus which are outright outside the log&apos;s scope.
              </li>
              <li>
                Severity weighting is linear (<code className="font-mono">SEVERITY_WEIGHT</code>: RINGAN
                1, SEDANG 2, BERAT 3) while ASTM D5340 deduct curves are not. Extent x severity is a
                stand-in for a deduct value the log does not carry, not a claim that the relationship is
                actually linear.
              </li>
              <li>
                The three candidate ranking metrics - count, area, severity x area - disagree on which
                distress dominates a branch, and on the hazard class that follows from it, for 5 of the
                31 covered branches. <code className="font-mono">DOMINANT_DISTRESS_METRIC</code> (currently{" "}
                <span className="text-foreground font-medium">{METRIC_LABEL[DOMINANT_DISTRESS_METRIC]}</span>) is
                a stated modelling decision for exactly that reason, not a default nobody chose.
              </li>
            </ul>
          </div>

          <div>
            <p className="text-foreground font-semibold text-[11px] uppercase tracking-wide mb-2">
              What Pasindu&apos;s model does not reproduce here
            </p>
            <p>
              Pasindu (2011) computes hydroplaning speed and braking distance from a finite-element
              tire-fluid-pavement simulation driven by rut depth, pavement texture depth, cross slope
              and aircraft landing-weight distributions. APMS records none of those measurements, so
              that computation cannot run on this network. What transfers from his work is the
              framing - grouping distresses by the failure mode they drive on aircraft operations
              rather than by pavement-engineering family (see the hazard-class comments in{" "}
              <code className="font-mono">riskScales.ts</code>) - not his numbers.
            </p>
          </div>

          <div>
            <p className="text-foreground font-semibold text-[11px] uppercase tracking-wide mb-2">
              A literature cross-check: Alberti &amp; Fiori (2019)
            </p>
            <p className="mb-2">
              Alberti &amp; Fiori&apos;s road-PMS treatment ladder (Table 12) triggers on PCI, the same
              signal APMS&apos;s rehabilitation plan uses. APMS is materially more conservative -
              treatment triggers earlier in the PCI range across the board:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide">
                    <th className="pb-1.5 pr-4 font-medium">Alberti Table 12</th>
                    <th className="pb-1.5 pr-4 font-medium">PCI range</th>
                    <th className="pb-1.5 pr-4 font-medium">APMS (rehab.ts)</th>
                    <th className="pb-1.5 font-medium">PCI ceiling</th>
                  </tr>
                </thead>
                <tbody>
                  {ALBERTI_TABLE_12.map((row, i) => (
                    <tr key={row.treatment} className="border-t border-border/60">
                      <td className="py-1.5 pr-4 text-foreground/90">{row.treatment}</td>
                      <td className="py-1.5 pr-4 font-mono tabular-nums">{row.pciRange}</td>
                      <td className="py-1.5 pr-4 text-foreground/90">
                        {REHAB_METHODOLOGY[i]?.treatment ?? "—"}
                      </td>
                      <td className="py-1.5 font-mono tabular-nums">
                        {REHAB_METHODOLOGY[i] ? `≤ ${REHAB_METHODOLOGY[i].maxPci}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              A branch stays untreated until PCI {REHAB_TRIGGER_PCI} or below here, against Alberti&apos;s
              85 for the equivalent first-tier treatment. Reported as a comparison for the results
              chapter - it changes nothing in <code className="font-mono">rehab.ts</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
