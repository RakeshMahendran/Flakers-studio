"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleSlash,
  ExternalLink,
  Shield,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import {
  GOVERNANCE_RULES,
  type GovernanceDecision,
  type GovernanceRuleId,
  type RuleEvaluation,
  type RuleStatus,
} from "./types";

interface GovernancePanelProps {
  decision: GovernanceDecision;
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional docs link override. */
  docsHref?: string;
}

const DEFAULT_DOCS_HREF = "/docs/governance";

/**
 * GovernancePanel — slide-out right drawer.
 *
 * Built on Radix Dialog so we get focus trapping, Esc-to-close, and
 * scroll-locking for free. Slide animation is driven by CSS rather than
 * framer-motion to keep keyboard interactions snappy.
 */
export function GovernancePanel({
  decision,
  open,
  onOpenChange,
  docsHref = DEFAULT_DOCS_HREF,
}: GovernancePanelProps) {
  const evaluations = mergeRuleEvaluations(decision.ruleEvaluations);
  const passedCount = evaluations.filter((r) => r.status === "passed").length;
  const totalEvaluated = evaluations.filter((r) => r.status !== "n/a").length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40",
            "bg-[oklch(0.16_0.012_270/0.40)]",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
          style={{
            // Fade timing — leverages globals' --duration tokens.
            transition: "opacity var(--duration-base) var(--ease-out)",
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col",
            "bg-[var(--color-surface)] border-l border-[var(--color-border-default)]",
            "shadow-[var(--elevation-4)]",
            "outline-none",
            "data-[state=open]:gov-slide-in data-[state=closed]:gov-slide-out",
          )}
          style={{
            // Slide in 240ms.
            transition: "transform 240ms var(--ease-out)",
          }}
        >
          <Header
            assistantName={decision.assistantName}
            decision={decision}
            passedCount={passedCount}
            totalEvaluated={totalEvaluated}
            onClose={() => onOpenChange(false)}
          />

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ol
              className="relative space-y-1"
              aria-label="Governance rule timeline"
            >
              {evaluations.map((rule, i) => (
                <RuleTimelineItem
                  key={rule.id}
                  rule={rule}
                  isLast={i === evaluations.length - 1}
                />
              ))}
            </ol>
          </div>

          {/* Footer */}
          <div
            className={cn(
              "flex items-center justify-between gap-3 px-5 py-4",
              "border-t border-[var(--color-border-subtle)]",
              "bg-[var(--color-surface-sunken)]",
            )}
          >
            <div className="text-[10px] text-[var(--color-text-muted)]">
              {decision.processingTimeMs != null
                ? `Evaluated in ${decision.processingTimeMs}ms`
                : "Real-time evaluation"}
            </div>
            <a
              href={docsHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                "text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "rounded-md px-1.5 py-0.5",
              )}
              aria-label="Open governance documentation in new tab"
            >
              Governance docs
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */
interface HeaderProps {
  assistantName?: string;
  decision: GovernanceDecision;
  passedCount: number;
  totalEvaluated: number;
  onClose: () => void;
}

function Header({
  assistantName,
  decision,
  passedCount,
  totalEvaluated,
  onClose,
}: HeaderProps) {
  const isAnswer = decision.decision === "ANSWER";
  return (
    <div
      className={cn(
        "px-5 pt-5 pb-4 border-b border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              "bg-gradient-trust text-white",
              "shadow-[var(--elevation-glow-trust)]",
            )}
            aria-hidden
          >
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <Dialog.Title className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)] truncate">
              {assistantName || "Governance"}
            </Dialog.Title>
            <Dialog.Description className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              {isAnswer ? "Decision: Answer" : "Decision: Refuse"}
            </Dialog.Description>
          </div>
        </div>

        <Dialog.Close asChild>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close governance panel"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md",
              "text-[var(--color-text-muted)]",
              "hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={isAnswer ? "trust" : "refuse"}>
          {isAnswer ? (
            <Check className="h-3 w-3" />
          ) : (
            <CircleSlash className="h-3 w-3" />
          )}
          Active · {passedCount}/{totalEvaluated || 6} rules
          {isAnswer ? " enforced" : " evaluated"}
        </Badge>
        {decision.confidence != null ? (
          <Badge variant="neutral">
            Confidence{" "}
            <span className="font-mono">
              {Math.round(
                Math.max(0, Math.min(1, decision.confidence)) * 100,
              )}
              %
            </span>
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline item                                                       */
/* ------------------------------------------------------------------ */
interface RuleTimelineItemProps {
  rule: RuleEvaluation & { label: string; description: string };
  isLast: boolean;
}

function RuleTimelineItem({
  rule,
  isLast,
}: RuleTimelineItemProps) {
  const [open, setOpen] = React.useState(false);
  const tone = statusTone(rule.status);

  return (
    <li className="relative pl-8">
      {/* Connector line */}
      {!isLast ? (
        <span
          aria-hidden
          className="absolute left-[11px] top-7 bottom-[-4px] w-px bg-[var(--color-border-subtle)]"
        />
      ) : null}
      {/* Status dot */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full",
          "border",
          tone.dotBg,
          tone.dotBorder,
          tone.dotFg,
        )}
      >
        <StatusIcon status={rule.status} />
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md px-2 py-2",
          "text-left",
          "hover:bg-[var(--color-surface-sunken)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {rule.label}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em]",
                tone.label,
              )}
            >
              {statusLabel(rule.status)}
            </span>
          </div>
          {rule.detail ? (
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] leading-snug">
              {rule.detail}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]",
            "transition-transform duration-[var(--duration-fast)]",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className={cn(
            "ml-2 mb-2 rounded-md px-3 py-2 text-xs",
            "bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)]",
            "text-[var(--color-text-secondary)] leading-relaxed",
          )}
        >
          {rule.description}
        </div>
      ) : null}
    </li>
  );
}

interface StatusIconProps {
  status: RuleStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  if (status === "passed") return <Check className="h-3.5 w-3.5" />;
  if (status === "borderline") return <AlertTriangle className="h-3 w-3" />;
  if (status === "failed") return <X className="h-3.5 w-3.5" />;
  return <CircleSlash className="h-3 w-3" />;
}

function statusLabel(status: RuleStatus): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "borderline":
      return "Borderline";
    case "failed":
      return "Failed";
    case "n/a":
      return "n/a";
  }
}

function statusTone(status: RuleStatus) {
  if (status === "passed") {
    return {
      dotBg: "bg-[var(--color-trust-soft)]",
      dotBorder: "border-[var(--color-trust-border)]",
      dotFg: "text-[var(--color-trust-strong)]",
      label: "text-[var(--color-trust-strong)]",
    };
  }
  if (status === "borderline") {
    return {
      dotBg: "bg-[var(--color-caution-soft)]",
      dotBorder: "border-[var(--color-caution-border)]",
      dotFg: "text-[var(--color-caution-strong)]",
      label: "text-[var(--color-caution-strong)]",
    };
  }
  if (status === "failed") {
    return {
      dotBg: "bg-[var(--color-refuse-soft)]",
      dotBorder: "border-[var(--color-refuse-border)]",
      dotFg: "text-[var(--color-refuse-strong)]",
      label: "text-[var(--color-refuse-strong)]",
    };
  }
  return {
    dotBg: "bg-[var(--color-surface-sunken)]",
    dotBorder: "border-[var(--color-border-subtle)]",
    dotFg: "text-[var(--color-text-muted)]",
    label: "text-[var(--color-text-muted)]",
  };
}

/* ------------------------------------------------------------------ */
/* Merge backend rule evals with the canonical 6 rules so the timeline */
/* always shows the full set, even when backend skipped some.          */
/* ------------------------------------------------------------------ */
type MergedEval = RuleEvaluation & { label: string; description: string };

function mergeRuleEvaluations(
  evals?: RuleEvaluation[],
): MergedEval[] {
  const byId = new Map<GovernanceRuleId, RuleEvaluation>();
  if (evals) {
    for (const e of evals) byId.set(e.id, e);
  }
  return GOVERNANCE_RULES.map((meta) => {
    const e = byId.get(meta.id);
    return {
      id: meta.id,
      status: e?.status ?? "n/a",
      detail: e?.detail,
      label: meta.label,
      description: meta.description,
    };
  });
}
