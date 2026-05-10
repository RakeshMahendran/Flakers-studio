"use client";

/**
 * GradientHero — full-bleed gradient mesh background with slow drift.
 *
 * CSS-only animation (no canvas, no WebGL, no heavy SVG). The mesh consumes
 * the design-system `--gradient-mesh-bg` token and animates via the shared
 * `mesh-drift` keyframe declared in `client/src/styles/animations.css`.
 *
 * The component is intentionally a thin shell: it paints the background
 * layer and exposes a `children` slot for hero content (headline, CTAs).
 */
import * as React from "react";
import { cn } from "@/lib/design-system";

export interface GradientHeroProps extends React.HTMLAttributes<HTMLElement> {
  /** Drop the slow mesh drift animation (e.g. for prefers-reduced-motion debugging). */
  staticBackground?: boolean;
}

export const GradientHero = React.forwardRef<HTMLElement, GradientHeroProps>(
  function GradientHero(
    { className, staticBackground, children, ...props },
    ref
  ) {
    return (
      <section
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          "relative isolate overflow-hidden",
          "bg-[var(--color-background)]",
          className
        )}
        {...props}
      >
        {/* Mesh gradient layer — sized larger than the viewport so the
         * drift animation never reveals hard edges. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-[10%] -z-10",
            "bg-gradient-mesh",
            "bg-[length:140%_140%]",
            staticBackground ? "" : "animate-mesh-drift"
          )}
        />
        {/* Soft top fade so headline text always sits on a quieter band. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-[var(--color-background)] to-transparent"
        />
        {/* Bottom fade into the next section. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-[var(--color-background)] to-transparent"
        />
        {children}
      </section>
    );
  }
);
