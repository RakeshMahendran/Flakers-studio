"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Shield,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { ConfidenceRing } from "./confidence-ring";
import {
  GOVERNANCE_RULE_LABELS,
  type GovernanceDecision,
  type GovernanceSource,
  type RuleEvaluation,
} from "./types";

interface AnswerCardProps {
  decision: GovernanceDecision;
  /** Open the SourceExplorer in a side panel for this source. */
  onOpenSource?: (source: GovernanceSource) => void;
  /** Open the GovernancePanel for the full rule timeline. */
  onOpenGovernance?: () => void;
  /** Thumbs-up / thumbs-down feedback. */
  onFeedback?: (rating: "up" | "down") => void;
  className?: string;
}

const cascadeStaggerClass = (i: number) => {
  const k = Math.min(6, i + 1);
  return `stagger-${k}`;
};

export function AnswerCard({
  decision,
  onOpenSource,
  onOpenGovernance,
  onFeedback,
  className,
}: AnswerCardProps) {
  const {
    answer = "",
    confidence,
    sources = [],
    ruleEvaluations = [],
    processingTimeMs,
  } = decision;

  const [copied, setCopied] = React.useState(false);
  const [feedback, setFeedback] = React.useState<"up" | "down" | null>(null);
  // Trust pulse plays exactly once on mount, then settles.
  const [pulseDone, setPulseDone] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setPulseDone(true), 500);
    return () => window.clearTimeout(t);
  }, []);

  const handleCopy = React.useCallback(async () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(answer);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* swallow — clipboard not available */
    }
  }, [answer]);

  const handleFeedback = React.useCallback(
    (rating: "up" | "down") => {
      setFeedback(rating);
      onFeedback?.(rating);
    },
    [onFeedback],
  );

  // Show only rules that actually evaluated (passed/borderline/failed)
  // — n/a are noise on the card; full list lives in GovernancePanel.
  const visibleRules = ruleEvaluations.filter((r) => r.status !== "n/a");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative",
        !pulseDone && "animate-pulse-trust",
        className,
      )}
    >
      <Card
        elevation={2}
        padding="none"
        className={cn(
          "overflow-hidden",
          "transition-shadow duration-[var(--duration-base)] ease-[var(--ease-out)]",
          "hover:shadow-[var(--elevation-3)]",
        )}
      >
        {/* 2px gradient stripe */}
        <div className="h-[2px] w-full bg-gradient-trust" aria-hidden />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full",
                "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
                "border border-[var(--color-trust-border)]",
              )}
              aria-hidden
            >
              <Shield className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-trust-strong)]">
                Answered
              </span>
              {processingTimeMs != null ? (
                <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                  {processingTimeMs}ms · {sources.length} source
                  {sources.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {sources.length} source{sources.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {confidence != null ? (
              <button
                type="button"
                onClick={onOpenGovernance}
                className={cn(
                  "rounded-full transition-shadow",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
                )}
                aria-label={`Confidence: ${Math.round(
                  Math.max(0, Math.min(1, confidence)) * 100,
                )}%. Open governance panel.`}
                title="Open governance details"
              >
                <ConfidenceRing score={confidence} size={36} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Body — markdown answer */}
        <div className="px-5 pb-4">
          <div
            className={cn(
              "prose prose-sm max-w-none",
              "text-[var(--color-text-primary)]",
              "prose-headings:text-[var(--color-text-primary)]",
              "prose-strong:text-[var(--color-text-primary)]",
              "prose-a:text-[var(--color-brand)] prose-a:no-underline hover:prose-a:underline",
              "prose-code:text-[var(--color-brand)] prose-code:bg-[var(--color-brand-soft)]",
              "prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
            )}
          >
            {answer ? (
              <Streamdown>{answer}</Streamdown>
            ) : (
              <span className="text-[var(--color-text-muted)]">
                (no answer text)
              </span>
            )}
          </div>
        </div>

        {/* Source chips — horizontal scroll on wide, vertical stack <500px */}
        {sources.length > 0 ? (
          <div className="px-5 pb-3">
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em] mb-2",
                "text-[var(--color-text-muted)]",
              )}
            >
              Sources
            </div>
            <div
              className={cn(
                "flex gap-2",
                // Default: row, scrollable horizontally.
                "overflow-x-auto",
                // Stack when narrow.
                "max-[500px]:flex-col max-[500px]:overflow-visible",
                // Hide scrollbar visually but keep keyboard scroll.
                "[scrollbar-width:thin]",
              )}
            >
              {sources.map((s, i) => (
                <SourceChip
                  key={s.id ?? i}
                  source={s}
                  index={i}
                  onOpen={onOpenSource}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Applied-rules row */}
        {visibleRules.length > 0 ? (
          <div className="px-5 pb-3">
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.16em] mb-2",
                "text-[var(--color-text-muted)]",
              )}
            >
              Rules applied
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleRules.map((r, i) => (
                <RuleChip key={r.id} rule={r} index={i} />
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer — feedback + copy */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-5 py-3",
            "border-t border-[var(--color-border-subtle)]",
            "bg-[var(--color-surface-sunken)]/60",
          )}
        >
          <div className="flex items-center gap-1">
            <FooterIconButton
              label="Helpful"
              active={feedback === "up"}
              onClick={() => handleFeedback("up")}
            >
              <ThumbsUp className="h-4 w-4" />
            </FooterIconButton>
            <FooterIconButton
              label="Not helpful"
              active={feedback === "down"}
              onClick={() => handleFeedback("down")}
            >
              <ThumbsDown className="h-4 w-4" />
            </FooterIconButton>
          </div>
          <div className="flex items-center gap-1">
            {onOpenGovernance ? (
              <FooterIconButton
                label="Open governance details"
                onClick={onOpenGovernance}
              >
                <Shield className="h-4 w-4" />
              </FooterIconButton>
            ) : null}
            <FooterIconButton
              label={copied ? "Copied" : "Copy answer"}
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-[var(--color-trust-strong)]" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </FooterIconButton>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Source chip                                                         */
/* ------------------------------------------------------------------ */
function SourceChip({
  source,
  index,
  onOpen,
}: {
  source: GovernanceSource;
  index: number;
  onOpen?: (s: GovernanceSource) => void;
}) {
  const host = React.useMemo(() => {
    try {
      const url = new URL(source.url);
      // SECURITY: Only allow http/https protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'Invalid URL';
      }
      return url.host.replace(/^www\./, "");
    } catch {
      return 'Invalid URL';
    }
  }, [source.url]);

  // SECURITY: Validate favicon URL
  const safeFaviconUrl = React.useMemo(() => {
    if (!source.faviconUrl) return null;
    try {
      const url = new URL(source.faviconUrl);
      return ['http:', 'https:', 'data:'].includes(url.protocol) ? source.faviconUrl : null;
    } catch {
      return null;
    }
  }, [source.faviconUrl]);

  const truncated =
    source.title.length > 36
      ? `${source.title.slice(0, 33)}…`
      : source.title;

  const Icon = source.faviconUrl ? null : source.url.startsWith("http")
    ? Globe
    : FileText;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onOpen?.(source)}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border",
        "px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0",
        "bg-[var(--chip-source-bg)] text-[var(--chip-source-fg)] border-[var(--chip-source-border)]",
        "hover:shadow-[var(--elevation-1)] hover:border-[var(--color-accent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        "transition-all duration-[var(--duration-fast)]",
        "max-[500px]:w-full max-[500px]:justify-start",
      )}
      title={`${source.title} · ${host}`}
      aria-label={`Open source: ${source.title}`}
    >
      {safeFaviconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeFaviconUrl}
          alt=""
          className="h-3.5 w-3.5 rounded-sm"
          aria-hidden
        />
      ) : Icon ? (
        <Icon className="h-3.5 w-3.5" aria-hidden />
      ) : null}
      <span className="truncate max-w-[180px]">{truncated}</span>
      <span className="text-[10px] opacity-70">· {host}</span>
      <ExternalLink
        className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden
      />
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Rule chip — uses CSS rule-cascade animation                         */
/* ------------------------------------------------------------------ */
function RuleChip({ rule, index }: { rule: RuleEvaluation; index: number }) {
  const stagger = cascadeStaggerClass(index);
  const label = GOVERNANCE_RULE_LABELS[rule.id] ?? rule.id;

  const tone =
    rule.status === "passed"
      ? "rule"
      : rule.status === "borderline"
        ? "tag"
        : "tag";

  return (
    <span className={cn("animate-rule-cascade", stagger)}>
      <Chip
        variant={tone as "rule" | "tag"}
        icon={
          rule.status === "passed" ? (
            <Check className="h-3 w-3" />
          ) : rule.status === "borderline" ? (
            <Shield className="h-3 w-3" />
          ) : (
            <Shield className="h-3 w-3" />
          )
        }
        className={cn(
          rule.status === "borderline" &&
            "bg-[var(--color-caution-soft)] text-[var(--color-caution-strong)] border-[var(--color-caution-border)]",
          rule.status === "failed" &&
            "bg-[var(--color-refuse-soft)] text-[var(--color-refuse-strong)] border-[var(--color-refuse-border)]",
        )}
      >
        {label}
      </Chip>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Footer icon button                                                  */
/* ------------------------------------------------------------------ */
function FooterIconButton({
  label,
  children,
  active,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md",
        "text-[var(--color-text-muted)]",
        "hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        "transition-colors duration-[var(--duration-fast)]",
        active &&
          "bg-[var(--color-trust-soft)] text-[var(--color-trust-strong)]",
      )}
    >
      {children}
    </button>
  );
}
