"use client";

import * as React from "react";
import { cn } from "@/lib/design-system";

export type TimeWindowDays = 7 | 14 | 30 | 90;

interface TimeWindowToggleProps {
  value: TimeWindowDays;
  onChange: (v: TimeWindowDays) => void;
}

const OPTIONS: { label: string; value: TimeWindowDays }[] = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

/**
 * Segmented control for selecting the analytics time window.
 * Persists no state of its own — caller owns `value`.
 */
export function TimeWindowToggle({ value, onChange }: TimeWindowToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Time window"
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
              active
                ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--elevation-1)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
