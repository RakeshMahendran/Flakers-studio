"use client";

import * as React from "react";
import { cn, confidenceColor } from "@/lib/design-system";

interface ConfidenceRingProps {
  /** Score in [0, 1]. Out-of-range scores fail closed (show "refuse" tone). */
  score: number;
  /** Diameter in px. Defaults to 36 for the AnswerCard header pill. */
  size?: number;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** Show the % label inside the ring. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Circular progress ring for confidence scores.
 *
 * Color is driven by `confidenceColor()` from the design system so the
 * tone always matches whatever the rest of the governance surface is
 * showing. Includes an accessible label.
 */
export function ConfidenceRing({
  score,
  size = 36,
  strokeWidth = 3,
  showLabel = true,
  className,
}: ConfidenceRingProps) {
  const safe = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  const tone = confidenceColor(safe);
  const pct = Math.round(safe * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - safe * circumference;

  const stroke =
    tone === "trust"
      ? "var(--color-trust)"
      : tone === "caution"
        ? "var(--color-caution)"
        : "var(--color-refuse)";

  const labelColor =
    tone === "trust"
      ? "text-[var(--color-trust-strong)]"
      : tone === "caution"
        ? "text-[var(--color-caution-strong)]"
        : "text-[var(--color-refuse-strong)]";

  return (
    <span
      role="img"
      aria-label={`Confidence: ${pct}%`}
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition:
              "stroke-dashoffset var(--duration-slow) var(--ease-out), stroke var(--duration-base) var(--ease-out)",
          }}
        />
      </svg>
      {showLabel ? (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "text-[10px] font-bold tabular-nums leading-none",
            labelColor,
          )}
          aria-hidden
        >
          {pct}
        </span>
      ) : null}
    </span>
  );
}
