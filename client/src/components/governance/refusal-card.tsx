"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Info,
  Shield,
  Sparkles,
} from "lucide-react";

import { Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import {
  GOVERNANCE_RULE_LABELS,
  type GovernanceDecision,
  type RuleEvaluation,
} from "./types";

interface RefusalCardProps {
  decision: GovernanceDecision;
  onSuggestionClick?: (suggestion: string) => void;
  onOpenGovernance?: () => void;
  className?: string;
}

const FALLBACK_SUGGESTIONS = ["Rephrase your question"];

const REFUSAL_HEADLINES: Record<string, string> = {
  OUT_OF_SCOPE: "I can't answer this",
  NO_CONTEXT: "I don't have that yet",
  POLICY_VIOLATION: "I can't answer this",
  CROSS_TENANT: "I can't share that",
  INSUFFICIENT_CONFIDENCE: "I'm not confident enough",
};

const REFUSAL_FALLBACK_REASON: Record<string, string> = {
  OUT_OF_SCOPE:
    "This question is outside the scope I'm allowed to answer.",
  NO_CONTEXT:
    "I couldn't find anything in my knowledge base that's relevant to this.",
  POLICY_VIOLATION:
    "Answering this would conflict with the content policies I follow.",
  CROSS_TENANT:
    "The information you're asking about belongs to a different workspace.",
  INSUFFICIENT_CONFIDENCE:
    "I have some related material but not enough to answer reliably.",
};

export function RefusalCard({
  decision,
  onSuggestionClick,
  onOpenGovernance,
  className,
}: RefusalCardProps) {
  const {
    refusalReason,
    refusalCode,
    suggestions,
    ruleEvaluations = [],
    processingTimeMs,
  } = decision;

  const [whyOpen, setWhyOpen] = React.useState(false);

  const headline =
    (refusalCode && REFUSAL_HEADLINES[refusalCode]) ?? "I can't answer this";
  const reasonText =
    refusalReason ||
    (refusalCode && REFUSAL_FALLBACK_REASON[refusalCode]) ||
    "I can't help with this one — there's no source I can ground an answer in.";

  const blockingRules = ruleEvaluations.filter(
    (r) => r.status === "failed" || r.status === "borderline",
  );

  const tries = (suggestions && suggestions.length > 0
    ? suggestions
    : FALLBACK_SUGGESTIONS
  ).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      <Card
        elevation={1}
        padding="none"
        className={cn(
          "overflow-hidden",
          "bg-[var(--color-refuse-soft)]",
          "border-[var(--color-refuse-border)]",
        )}
      >
        {/* 2px gradient stripe */}
        <div className="h-[2px] w-full bg-gradient-refuse" aria-hidden />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              // Amber, NOT red — refusal is governance, not failure.
              "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)]",
              "border border-[var(--color-caution-border)]",
            )}
            aria-hidden
          >
            <Info className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] leading-snug"
              aria-live="polite"
            >
              {headline}
            </h3>
            <p
              className="mt-1 text-sm text-[var(--color-text-secondary)] leading-relaxed"
              aria-live="polite"
            >
              {reasonText}
            </p>
          </div>
        </div>

        {/* Why this happened — expandable */}
        {blockingRules.length > 0 ? (
          <div className="px-5 pb-2">
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md py-1 text-xs font-medium",
                "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                "transition-colors duration-[var(--duration-fast)]",
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Why this happened</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-[var(--duration-fast)]",
                  whyOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {whyOpen ? (
              <div className="mt-2 space-y-1.5">
                {blockingRules.map((r, i) => (
                  <BlockingRuleRow rule={r} key={r.id} index={i} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Try instead */}
        {tries.length > 0 ? (
          <div className="px-5 pb-3">
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em] mb-2",
                "text-[var(--color-text-muted)]",
              )}
            >
              Try instead
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tries.map((suggestion, i) => (
                <button
                  type="button"
                  key={`suggestion-${i}-${suggestion.slice(0, 20)}`}
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border",
                    "px-3 py-1 text-xs font-medium",
                    "bg-[var(--color-surface)] text-[var(--color-text-primary)]",
                    "border-[var(--color-border-default)]",
                    "hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]",
                    "hover:shadow-[var(--elevation-1)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                    "transition-all duration-[var(--duration-fast)]",
                  )}
                  aria-label={`Try suggestion: ${suggestion}`}
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-5 py-2.5",
            "border-t border-[var(--color-refuse-border)]/60",
            "text-[10px] text-[var(--color-text-muted)] tabular-nums",
          )}
        >
          <span className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3" aria-hidden />
            Governance refusal
            {refusalCode ? (
              <span className="font-mono opacity-70">· {refusalCode}</span>
            ) : null}
          </span>
          <div className="flex items-center gap-3">
            {processingTimeMs != null ? <span>{processingTimeMs}ms</span> : null}
            {onOpenGovernance ? (
              <button
                type="button"
                onClick={onOpenGovernance}
                className={cn(
                  "rounded-md px-1.5 py-0.5 underline-offset-2",
                  "hover:underline hover:text-[var(--color-text-primary)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                )}
              >
                See details
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface BlockingRuleRowProps {
  rule: RuleEvaluation;
  index: number;
}

function BlockingRuleRow({
  rule,
  index,
}: BlockingRuleRowProps) {
  const label = GOVERNANCE_RULE_LABELS[rule.id] ?? rule.id;
  const isBorderline = rule.status === "borderline";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
        "bg-[var(--color-surface)] border border-[var(--color-border-subtle)]",
        "animate-rule-cascade",
        index === 0 ? "stagger-1" : index === 1 ? "stagger-2" : "stagger-3",
      )}
    >
      <Chip
        variant="tag"
        className={cn(
          "shrink-0",
          isBorderline
            ? "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)] border-[var(--color-caution-border)]"
            : "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)] border-[var(--color-refuse-border)]",
        )}
        icon={<Shield className="h-3 w-3" />}
      >
        {label}
      </Chip>
      {rule.detail ? (
        <span className="text-[var(--color-text-secondary)] leading-snug">
          {rule.detail}
        </span>
      ) : null}
    </div>
  );
}
