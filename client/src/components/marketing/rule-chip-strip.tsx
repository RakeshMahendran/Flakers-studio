"use client";

/**
 * RuleChipStrip — horizontal strip of the six governance rules, rendered
 * with the design-system Chip primitive (variant="rule"). Mobile wraps to
 * two rows; desktop is a single line.
 *
 * The six rules echo the governance promise made by the public landing
 * trust strip ("Backed by governance, not vibes").
 */
import * as React from "react";
import {
  CircleCheck,
  Link2,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

interface Rule {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const RULES: Rule[] = [
  { id: "grounded",      label: "Grounded answers",     icon: <Link2 className="h-3.5 w-3.5" /> },
  { id: "cited",         label: "Cited sources",        icon: <CircleCheck className="h-3.5 w-3.5" /> },
  { id: "scoped",        label: "Scoped to tenant",     icon: <Lock className="h-3.5 w-3.5" /> },
  { id: "explained",     label: "Explained refusals",   icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: "auditable",     label: "Auditable trail",      icon: <Scale className="h-3.5 w-3.5" /> },
  { id: "no-free-form",  label: "No free-form facts",   icon: <Sparkles className="h-3.5 w-3.5" /> },
];

export interface RuleChipStripProps {
  className?: string;
  /** Heading rendered above the chips; pass null to omit. */
  heading?: React.ReactNode | null;
}

export function RuleChipStrip({
  className,
  heading = "Backed by governance, not vibes",
}: RuleChipStripProps) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {heading ? (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          {heading}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {RULES.map((rule, idx) => (
          <li
            key={rule.id}
            className={cn(
              "animate-rule-cascade",
              `stagger-${Math.min(idx + 1, 6)}`
            )}
          >
            <Chip variant="rule" icon={rule.icon}>
              {rule.label}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { RULES as GOVERNANCE_RULES };
