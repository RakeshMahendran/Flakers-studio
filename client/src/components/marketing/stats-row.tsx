"use client";

/**
 * StatsRow — three-column metric strip used on the marketing landing.
 * Each cell pairs a large number with a label and short context.
 */
import * as React from "react";
import { cn } from "@/lib/design-system";

interface Stat {
  value: string;
  label: string;
  context?: string;
}

interface StatsRowProps {
  className?: string;
  stats?: Stat[];
}

const DEFAULTS: Stat[] = [
  { value: "100%", label: "Source-cited answers", context: "Every answer links to its chunks" },
  { value: "<2s", label: "Median response time", context: "From query to streamed answer" },
  { value: "6 / 6", label: "Governance rules enforced", context: "By design, not by post-hoc check" },
];

export function StatsRow({ className, stats = DEFAULTS }: StatsRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 rounded-2xl border border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface)] p-6 shadow-[var(--elevation-1)] sm:grid-cols-3 sm:p-8",
        className
      )}
    >
      {stats.map((stat, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-col gap-1",
            i > 0 ? "sm:border-l sm:border-[var(--color-border-subtle)] sm:pl-6" : ""
          )}
        >
          <span className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            {stat.value}
          </span>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{stat.label}</span>
          {stat.context ? (
            <span className="text-xs text-[var(--color-text-tertiary)]">{stat.context}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
