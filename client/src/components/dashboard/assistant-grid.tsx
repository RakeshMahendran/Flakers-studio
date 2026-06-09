"use client";

/**
 * AssistantGrid — responsive 1/2/3-column grid of AssistantCards.
 * Renders a full-width gradient empty-state card when no assistants exist.
 */
import * as React from "react";
import { Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";
import { AssistantCard, type AssistantCardData } from "./assistant-card";

interface AssistantGridProps {
  assistants: AssistantCardData[];
  onSelect: (id: string) => void;
  onSettings: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export function AssistantGrid({
  assistants,
  onSelect,
  onSettings,
  onDelete,
  onCreate,
}: AssistantGridProps) {
  if (assistants.length === 0) {
    return (
      <section
        className={cn(
          "relative overflow-hidden rounded-xl border p-8 md:p-12",
          "border-[var(--color-border-subtle)] bg-[var(--color-surface)]",
          "shadow-[var(--elevation-1)]"
        )}
        aria-label="Empty assistants"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-mesh opacity-70 dark:opacity-90"
          style={{ backgroundSize: "180% 180%" }}
        />
        <div className="relative z-10 mx-auto flex max-w-md flex-col items-center text-center">
          <span
            className={cn(
              "inline-flex h-12 w-12 items-center justify-center rounded-xl",
              "bg-[image:var(--gradient-brand)] text-white shadow-[var(--elevation-2)]"
            )}
            aria-hidden
          >
            <Bot className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
            No assistants yet
          </h3>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Create your first governed assistant — point it at a website or upload
            documents and we&rsquo;ll handle the rest.
          </p>
          <Button onClick={onCreate} variant="primary" size="lg" className="mt-6">
            <Plus className="h-4 w-4" />
            Create your first assistant
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your assistants">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
            Your assistants
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {assistants.length} assistant{assistants.length === 1 ? "" : "s"} in this workspace
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assistants.map((a) => (
          <AssistantCard
            key={a.id}
            assistant={a}
            onSelect={() => onSelect(a.id)}
            onSettings={() => onSettings(a.id)}
            onDelete={() => onDelete(a.id)}
          />
        ))}
        {/* New assistant tile — dashed border, gradient on hover */}
        <button
          type="button"
          onClick={onCreate}
          aria-label="Create a new assistant"
          title="Create a new assistant"
          className={cn(
            "group relative flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-5",
            "border-[var(--color-border-default)] bg-transparent",
            "transition-[border-color,background] duration-[var(--duration-base)]",
            // Soften the hover fill: a hint of brand-soft instead of the
            // full brand-soft swatch (which can read as a jarring color swap).
            "hover:border-[var(--color-brand-border)] hover:bg-[var(--color-surface-sunken)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          )}
        >
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              "border border-[var(--color-border-default)] bg-[var(--color-surface)] text-[var(--color-text-muted)]",
              "transition-colors group-hover:border-[var(--color-brand-border)] group-hover:bg-[var(--color-surface)] group-hover:text-[var(--color-brand)]"
            )}
          >
            <Plus className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-brand)]">
            New assistant
          </span>
        </button>
      </div>
    </section>
  );
}
