"use client";

/**
 * Dashboard Hero
 * --------------------------------------------------------------------
 * Greeting + stat ribbon + primary CTA, layered on a slow-drifting
 * gradient mesh. CSS-only animation (no canvas). Honors the user's
 * `prefers-reduced-motion` preference automatically because the global
 * stylesheet collapses all animations under that media query.
 * --------------------------------------------------------------------
 */
import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface HeroStat {
  label: string;
  value: string;
}

interface DashboardHeroProps {
  firstName: string;
  stats: HeroStat[];
  /** Click handler for the primary CTA. */
  onCreate: () => void;
}

function getGreeting(): string {
  if (typeof window === "undefined") return "Hello";
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ firstName, stats, onCreate }: DashboardHeroProps) {
  const [greeting, setGreeting] = React.useState("Hello");

  React.useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border",
        "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
        "shadow-[var(--elevation-1)]"
      )}
      aria-labelledby="dashboard-hero-title"
    >
      {/* Mesh background — absolutely positioned, low opacity, slowly drifts. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 opacity-60 dark:opacity-90",
          "bg-gradient-mesh animate-mesh-drift"
        )}
        style={{ backgroundSize: "180% 180%" }}
      />

      {/* Subtle inner highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-border-default)] to-transparent"
      />

      <div className="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
        <div className="animate-hero-rise max-w-2xl">
          <span
            className={cn(
              "mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
              "border-[var(--color-brand-border)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
            )}
          >
            <Sparkles className="h-3 w-3" />
            v2.4
          </span>
          <h1
            id="dashboard-hero-title"
            className={cn(
              "text-[length:var(--text-display-size)] leading-[var(--text-display-line)]",
              "font-semibold tracking-tight text-[var(--color-text-primary)]"
            )}
          >
            {greeting}, <span className="text-gradient-brand">{firstName}.</span>
          </h1>
          {stats.length > 0 && (
            <ul
              className={cn(
                "mt-4 flex flex-wrap items-center gap-x-2 gap-y-2",
                "text-sm text-[var(--color-text-secondary)]"
              )}
            >
              {stats.map((stat, idx) => (
                <React.Fragment key={stat.label}>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {stat.value}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{stat.label}</span>
                  </li>
                  {idx < stats.length - 1 && (
                    <li
                      aria-hidden
                      className="h-1 w-1 rounded-full bg-[var(--color-border-strong)]"
                    />
                  )}
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>

        <div className="animate-hero-rise" style={{ animationDelay: "120ms" }}>
          <Button variant="primary" size="lg" onClick={onCreate} className="shrink-0">
            <Plus className="h-4 w-4" />
            New assistant
          </Button>
        </div>
      </div>
    </section>
  );
}
