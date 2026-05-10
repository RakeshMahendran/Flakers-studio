"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/design-system";

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "bottom";
  ariaLabel: string;
  children: React.ReactNode;
}

/**
 * Lightweight sheet — used on mobile to collapse the thread history
 * (left side) and the optional governance panel (bottom).
 *
 * Built on a plain dialog primitive (no extra deps) — focus trap is
 * handled by the focus-visible ring and Esc-to-close.
 */
export function MobileSheet({
  open,
  onClose,
  side = "left",
  ariaLabel,
  children,
}: MobileSheetProps) {
  // Esc to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-0 z-40 flex",
        side === "left" ? "items-stretch justify-start" : "items-end justify-stretch",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.16_0.012_270/0.40)] backdrop-blur-[2px]"
      />
      <div
        className={cn(
          "relative bg-[var(--color-surface)] shadow-[var(--elevation-4)]",
          side === "left"
            ? "h-dvh w-[88%] max-w-sm border-r border-[var(--color-border-subtle)]"
            : "max-h-[85dvh] w-full rounded-t-2xl border-t border-[var(--color-border-subtle)]",
          "animate-[gov-fade-in-kf_220ms_var(--ease-out)_both]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={cn(
            "absolute z-10 inline-flex h-8 w-8 items-center justify-center rounded-md",
            "text-[var(--color-text-muted)] hover:bg-[var(--button-ghost-bg-hover)]",
            "hover:text-[var(--color-text-primary)]",
            side === "left" ? "right-2 top-2" : "right-3 top-3",
          )}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="h-full w-full overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
