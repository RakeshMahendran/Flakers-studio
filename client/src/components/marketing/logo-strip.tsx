"use client";

/**
 * LogoStrip — social proof row.
 *
 * Renders a horizontal strip of stylized "company name" wordmarks. Since
 * we don't have real customer logos yet, we use design-token wordmarks
 * as placeholders that read as intentional rather than missing. Swap to
 * real SVGs when partnerships land.
 */
import * as React from "react";
import { cn } from "@/lib/design-system";

interface LogoStripProps {
  className?: string;
  heading?: React.ReactNode | null;
}

const LOGOS = [
  { name: "ACME", font: "italic font-serif tracking-tight" },
  { name: "Northwind", font: "font-light tracking-[0.2em] uppercase" },
  { name: "Aperture", font: "font-bold tracking-wide" },
  { name: "Hyperion", font: "font-semibold italic" },
  { name: "Kestrel", font: "font-light tracking-wider uppercase" },
  { name: "Olympia", font: "font-bold tracking-tight" },
];

export function LogoStrip({
  className,
  heading = "Built for teams who need to prove every answer",
}: LogoStripProps) {
  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      {heading ? (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          {heading}
        </p>
      ) : null}
      <div className="grid w-full grid-cols-2 items-center gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {LOGOS.map((logo) => (
          <span
            key={logo.name}
            aria-hidden
            className={cn(
              "text-center text-base text-[var(--color-text-tertiary)] opacity-70 transition-opacity hover:opacity-100",
              logo.font
            )}
          >
            {logo.name}
          </span>
        ))}
      </div>
    </div>
  );
}
