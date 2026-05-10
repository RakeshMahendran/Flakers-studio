"use client";

/**
 * Right-column collateral for /register — a 3-step onboarding preview
 * that mirrors the public landing's "ingest → govern → answer" arc.
 */
import * as React from "react";
import { BadgeCheck, Database, ScrollText, ShieldCheck } from "lucide-react";
import { Card, Chip } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

const STEPS = [
  {
    n: 1,
    title: "Connect content",
    body: "Point us at WordPress, a sitemap, or upload docs.",
    icon: <Database className="h-4 w-4" />,
  },
  {
    n: 2,
    title: "Configure governance",
    body: "Pick which sources, audiences, and refusal rules apply.",
    icon: <ScrollText className="h-4 w-4" />,
  },
  {
    n: 3,
    title: "Ship a governed assistant",
    body: "Embed it, test it, watch the audit trail fill in real time.",
    icon: <BadgeCheck className="h-4 w-4" />,
  },
] as const;

export function RegisterAside() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Chip variant="rule" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          Three steps to live
        </Chip>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
          From signup to a{" "}
          <span className="text-gradient-brand">governed assistant.</span>
        </h2>
        <p className="text-base text-[var(--color-text-secondary)]">
          Most teams ship their first assistant the same afternoon they sign up.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, i) => (
          <li
            key={step.n}
            className={cn(
              "animate-rule-cascade",
              `stagger-${Math.min(i + 1, 6)}`
            )}
          >
            <Card
              elevation={1}
              padding="md"
              className="bg-[var(--color-surface)]/85 backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-1 ring-[var(--color-brand-border)]"
                >
                  {step.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                      Step {step.n}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {step.body}
                  </p>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <p className="text-xs text-[var(--color-text-muted)]">
        Your data stays in your tenant. Always.
      </p>
    </div>
  );
}
