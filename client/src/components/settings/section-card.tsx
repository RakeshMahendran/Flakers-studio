"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/primitives";
import { cn } from "@/lib/design-system";

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Lightweight Card wrapper for settings sections.
 * Pairs a title + description with content body, all token-driven.
 */
export function SectionCard({ title, description, icon, children, className }: SectionCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-[var(--color-border-subtle)] p-6">
        <div className="flex items-center gap-3">
          {icon ? (
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-secondary)]"
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription className="text-sm">{description}</CardDescription> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
