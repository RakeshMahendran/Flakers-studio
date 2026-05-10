"use client";

import * as React from "react";
import { cn } from "@/lib/design-system";

/**
 * SuggestionChip — local "suggestion" variant for follow-up questions.
 *
 * Spec calls for a chip variant that doesn't exist in `primitives.tsx`.
 * Per the no-modify-primitives rule, this is a local composition that uses
 * the same design tokens as `<Chip variant="tag">` but adds the spec'd
 * hover-lifts-to-brand interaction.
 */
export interface SuggestionChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
}

export const SuggestionChip = React.forwardRef<
  HTMLButtonElement,
  SuggestionChipProps
>(function SuggestionChip(
  { className, icon, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border",
        "px-3 py-1.5 text-xs font-medium",
        "bg-[var(--color-surface)] text-[var(--color-text-secondary)]",
        "border-[var(--color-border-default)]",
        "transition-[background,color,border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]",
        "hover:-translate-y-0.5 hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)] hover:border-[var(--color-brand-border)]",
        "hover:shadow-[var(--elevation-1)]",
        "active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-focus-ring-offset)]",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          className="inline-flex h-3.5 w-3.5 items-center justify-center text-[var(--color-text-muted)] group-hover:text-[var(--color-brand)]"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  );
});
