"use client";

/**
 * OnboardingChecklist — first-run guide for empty dashboards.
 *
 * Shown when the user has no assistants. Replaces the "empty state with a
 * lonely button" pattern with a guided 3-step list that mirrors the
 * landing-page promise.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Database,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

interface OnboardingChecklistProps {
  hasAssistant: boolean;
  hasReadyAssistant: boolean;
  hasChatted?: boolean;
  className?: string;
}

export function OnboardingChecklist({
  hasAssistant,
  hasReadyAssistant,
  hasChatted = false,
  className,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const steps: ChecklistStep[] = [
    {
      id: "create",
      title: "Create your first assistant",
      description: "Point it at a website or upload docs — chunked & indexed automatically.",
      ctaLabel: "Create",
      href: "/assistant/create",
      done: hasAssistant,
      icon: Plus,
    },
    {
      id: "ingest",
      title: "Wait for ingestion",
      description: "We discover, scrape, and embed your content. Usually under a minute.",
      ctaLabel: "View progress",
      href: "/content",
      done: hasReadyAssistant,
      icon: Database,
    },
    {
      id: "chat",
      title: "Try a query",
      description: "Ask something it should answer, and something it shouldn't. See governance in action.",
      ctaLabel: "Start chat",
      href: hasReadyAssistant ? "/dashboard" : "/assistant/create",
      done: hasChatted,
      icon: Sparkles,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const nextStepIdx = steps.findIndex((s) => !s.done);

  return (
    <Card elevation={1} className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Get to your first answer</CardTitle>
            <CardDescription>
              Three quick steps. You&rsquo;ll be done in under two minutes.
            </CardDescription>
          </div>
          <Badge variant={completed === steps.length ? "trust" : "brand"}>
            {completed} / {steps.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ol className="divide-y divide-[var(--color-border-subtle)]">
          {steps.map((step, i) => {
            const isNext = i === nextStepIdx;
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                className={cn(
                  "group relative flex items-center gap-4 p-5 transition-colors",
                  isNext
                    ? "bg-[var(--color-brand-soft)]/40"
                    : "hover:bg-[var(--color-surface-sunken)]"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    step.done
                      ? "bg-[var(--color-trust)] text-white"
                      : isNext
                      ? "bg-[var(--color-brand)] text-white"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]"
                  )}
                  aria-hidden
                >
                  {step.done ? (
                    <Check className="h-4 w-4" />
                  ) : isNext ? (
                    <Icon className="h-4 w-4" />
                  ) : (
                    <CircleDashed className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.done
                        ? "text-[var(--color-text-tertiary)] line-through"
                        : "text-[var(--color-text-primary)]"
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    {step.description}
                  </p>
                </div>
                {!step.done && isNext ? (
                  <Button size="sm" variant="primary" onClick={() => router.push(step.href)}>
                    {step.ctaLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : !step.done ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(step.href)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {step.ctaLabel}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
