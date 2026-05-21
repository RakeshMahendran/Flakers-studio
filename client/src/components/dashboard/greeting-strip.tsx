"use client";

/**
 * GreetingStrip — compact dashboard header.
 *
 * Replaces the larger DashboardHero. Renders in roughly 64px of vertical
 * space and surfaces the most relevant action (Create assistant) plus a
 * subtle time-of-day greeting and tenant identifier.
 */
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

interface GreetingStripProps {
  firstName: string;
  tenantName?: string;
  onCreate: () => void;
  className?: string;
}

function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function GreetingStrip({
  firstName,
  tenantName,
  onCreate,
  className,
}: GreetingStripProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {getGreeting()}, {firstName}
        </h1>
        {tenantName ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Workspace · <span className="font-medium">{tenantName}</span>
          </p>
        ) : null}
      </div>
      <Button variant="primary" size="md" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        New assistant
      </Button>
    </header>
  );
}
